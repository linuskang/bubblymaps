#!/usr/bin/env python3
"""
Async uploader for Bubbly Maps waypoints API.

Examples:
  python upload.py CityOfVancouver/bubbly-bubblers.json --token YOUR_TOKEN
  python upload.py CityOfVancouver/bubbly-bubblers.json --endpoint https://bubbly.linus.my/api/waypoints --concurrency 30
  python upload.py CityOfVancouver/bubbly-bubblers.json --dry-run
"""

import argparse
import asyncio
import json
import logging
import os
import random
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    import aiohttp
except ImportError:
    print("Error: aiohttp is required. Install with: pip install aiohttp")
    sys.exit(1)

DEFAULT_ENDPOINT = "https://bubbly.linus.my/api/waypoints"
RETRYABLE_STATUSES = {429, 500, 502, 503, 504}
ALLOWED_FIELDS = {
    "name",
    "latitude",
    "longitude",
    "description",
    "amenities",
    "image",
    "maintainer",
    "region",
    "approved",
    "verified",
    "addedByUserId",
}


def setup_logger(log_file: Path, verbose: bool) -> logging.Logger:
    logger = logging.getLogger("bubbly_uploader")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setLevel(logging.DEBUG if verbose else logging.INFO)
    stream_handler.setFormatter(formatter)

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)

    logger.addHandler(stream_handler)
    logger.addHandler(file_handler)
    return logger


def load_input_data(input_path: Path) -> Tuple[List[Dict[str, Any]], str]:
    payload = json.loads(input_path.read_text(encoding="utf-8"))

    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return payload["data"], str(payload.get("source") or "Unknown")

    if isinstance(payload, list):
        return payload, "Unknown"

    raise ValueError("Input must be an array or an object with a 'data' array")


def sanitize_record(record: Dict[str, Any]) -> Tuple[Dict[str, Any] | None, str | None]:
    data = {k: v for k, v in record.items() if k in ALLOWED_FIELDS and v is not None}

    if "amenities" not in data:
        data["amenities"] = []

    if "approved" not in data:
        data["approved"] = False

    if "verified" not in data:
        data["verified"] = False

    if "addedByUserId" not in data or not str(data["addedByUserId"]).strip():
        data["addedByUserId"] = "api"

    for required in ("name", "latitude", "longitude"):
        if required not in data:
            return None, f"missing field: {required}"

    try:
        data["latitude"] = float(data["latitude"])
        data["longitude"] = float(data["longitude"])
    except (TypeError, ValueError):
        return None, "latitude/longitude must be numeric"

    if not (-90 <= data["latitude"] <= 90 and -180 <= data["longitude"] <= 180):
        return None, "latitude/longitude out of range"

    name = str(data["name"]).strip()
    if not name:
        return None, "name is empty"
    data["name"] = name

    return data, None


async def post_one(
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore,
    endpoint: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
    index: int,
    total: int,
    retries: int,
    timeout_sec: int,
    logger: logging.Logger,
) -> Dict[str, Any]:
    attempt = 0

    while True:
        attempt += 1
        try:
            async with semaphore:
                timeout = aiohttp.ClientTimeout(total=timeout_sec)
                async with session.post(endpoint, headers=headers, json=payload, timeout=timeout) as resp:
                    text = await resp.text()
                    try:
                        body = json.loads(text) if text else {}
                    except json.JSONDecodeError:
                        body = {"raw": text}

                    if resp.status == 201:
                        result = body.get("result", {}) if isinstance(body, dict) else {}
                        waypoint_id = result.get("id")
                        logger.info(
                            "[%s/%s] ADDED | id=%s | %s (%.6f, %.6f)",
                            index,
                            total,
                            waypoint_id,
                            payload.get("name"),
                            payload.get("latitude"),
                            payload.get("longitude"),
                        )
                        return {
                            "status": "added",
                            "http_status": 201,
                            "payload": payload,
                            "response": body,
                        }

                    error_text = body.get("error") if isinstance(body, dict) else str(body)
                    error_text = error_text or f"HTTP {resp.status}"

                    if resp.status in RETRYABLE_STATUSES and attempt <= retries:
                        delay = min(10.0, (2 ** (attempt - 1)) + random.uniform(0, 0.5))
                        logger.warning(
                            "[%s/%s] RETRY | attempt=%s/%s | status=%s | %s | sleeping %.2fs",
                            index,
                            total,
                            attempt,
                            retries,
                            resp.status,
                            payload.get("name"),
                            delay,
                        )
                        await asyncio.sleep(delay)
                        continue

                    lowered = str(error_text).lower()
                    if "unique" in lowered or "duplicate" in lowered:
                        logger.warning(
                            "[%s/%s] DUPLICATE | status=%s | %s",
                            index,
                            total,
                            resp.status,
                            payload.get("name"),
                        )
                        return {
                            "status": "duplicate",
                            "http_status": resp.status,
                            "payload": payload,
                            "response": body,
                        }

                    logger.error(
                        "[%s/%s] FAILED | status=%s | %s | error=%s",
                        index,
                        total,
                        resp.status,
                        payload.get("name"),
                        error_text,
                    )
                    return {
                        "status": "failed",
                        "http_status": resp.status,
                        "payload": payload,
                        "response": body,
                    }

        except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
            if attempt <= retries:
                delay = min(10.0, (2 ** (attempt - 1)) + random.uniform(0, 0.5))
                logger.warning(
                    "[%s/%s] RETRY | attempt=%s/%s | network error | %s | sleeping %.2fs",
                    index,
                    total,
                    attempt,
                    retries,
                    payload.get("name"),
                    delay,
                )
                await asyncio.sleep(delay)
                continue

            logger.error(
                "[%s/%s] FAILED | network error | %s | error=%s",
                index,
                total,
                payload.get("name"),
                str(exc),
            )
            return {
                "status": "failed",
                "http_status": None,
                "payload": payload,
                "response": {"error": str(exc)},
            }


async def run_upload(args: argparse.Namespace, logger: logging.Logger) -> int:
    input_path = Path(args.input)
    records, source = load_input_data(input_path)
    logger.info("Loaded %s records from %s (source=%s)", len(records), input_path, source)

    sanitized: List[Dict[str, Any]] = []
    invalid: List[Dict[str, Any]] = []
    seen_coords: set[Tuple[float, float]] = set()

    for i, record in enumerate(records, start=1):
        clean, err = sanitize_record(record)
        if not clean:
            invalid.append({"index": i, "record": record, "error": err})
            continue

        coord_key = (clean["latitude"], clean["longitude"])
        if args.dedupe and coord_key in seen_coords:
            invalid.append({"index": i, "record": record, "error": "duplicate coordinates in input"})
            continue

        seen_coords.add(coord_key)
        sanitized.append(clean)

    logger.info("Valid records: %s | Invalid/skipped: %s", len(sanitized), len(invalid))

    if args.dry_run:
        logger.info("Dry-run enabled: no API calls were made.")
        logger.info("First payload sample: %s", json.dumps(sanitized[:1], ensure_ascii=False))
        return 0

    if not args.token:
        logger.error("Missing API token. Provide --token or API_TOKEN env var.")
        return 2

    headers = {
        "Authorization": f"Bearer {args.token}",
        "Content-Type": "application/json",
    }

    timeout = aiohttp.ClientTimeout(total=args.timeout)
    connector = aiohttp.TCPConnector(limit=max(args.concurrency * 2, 20), ssl=True)
    semaphore = asyncio.Semaphore(args.concurrency)

    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        tasks = [
            post_one(
                session=session,
                semaphore=semaphore,
                endpoint=args.endpoint,
                headers=headers,
                payload=payload,
                index=idx,
                total=len(sanitized),
                retries=args.retries,
                timeout_sec=args.timeout,
                logger=logger,
            )
            for idx, payload in enumerate(sanitized, start=1)
        ]
        results = await asyncio.gather(*tasks)

    added = sum(1 for r in results if r["status"] == "added")
    duplicate = sum(1 for r in results if r["status"] == "duplicate")
    failed = [r for r in results if r["status"] == "failed"]

    logger.info("Upload complete")
    logger.info("Summary: added=%s duplicate=%s failed=%s skipped_invalid=%s", added, duplicate, len(failed), len(invalid))

    if invalid:
        invalid_path = Path(args.invalid_output)
        invalid_path.write_text(json.dumps(invalid, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("Wrote invalid/skipped records to %s", invalid_path)

    if failed:
        failed_path = Path(args.failed_output)
        failed_path.write_text(json.dumps(failed, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.error("Wrote failed API records to %s", failed_path)
        return 1

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Async upload bubbler records to /api/waypoints")
    parser.add_argument("input", help="Path to bubbler JSON file (array or {source,data} format)")
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help=f"Waypoints endpoint (default: {DEFAULT_ENDPOINT})")
    parser.add_argument("--token", default=os.getenv("API_TOKEN"), help="Bearer token (or set API_TOKEN env var)")
    parser.add_argument("--concurrency", type=int, default=25, help="Max concurrent requests (default: 25)")
    parser.add_argument("--retries", type=int, default=3, help="Retries per request for retryable errors (default: 3)")
    parser.add_argument("--timeout", type=int, default=30, help="Request timeout in seconds (default: 30)")
    parser.add_argument("--dry-run", action="store_true", help="Validate and log payloads without sending requests")
    parser.add_argument("--dedupe", action="store_true", default=True, help="Skip duplicate lat/lng records in input")
    parser.add_argument("--no-dedupe", action="store_false", dest="dedupe", help="Do not dedupe input by coordinates")
    parser.add_argument("--log-file", default="upload.log", help="Log file path (default: upload.log)")
    parser.add_argument("--failed-output", default="upload-failed.json", help="Write failed API requests to this file")
    parser.add_argument("--invalid-output", default="upload-invalid.json", help="Write invalid/skipped input records to this file")
    parser.add_argument("--verbose", action="store_true", help="Enable debug-level console logs")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    logger = setup_logger(Path(args.log_file), verbose=args.verbose)

    try:
        exit_code = asyncio.run(run_upload(args, logger))
    except KeyboardInterrupt:
        logger.warning("Interrupted by user")
        exit_code = 130
    except Exception as exc:
        logger.exception("Fatal error: %s", str(exc))
        exit_code = 2

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
