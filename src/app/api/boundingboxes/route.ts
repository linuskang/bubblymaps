import { BoundingBoxes, type BoundingBoxData } from "@/server/boundingboxes/boundingboxes";
import { NextRequest, NextResponse } from "next/server";
import { logEndpointActivity } from "@/server/logging/discord";

export async function GET() {
  try {

    // Fetch bounding boxes
    const boundingBoxes = await BoundingBoxes.getAll();

    // Return
    return NextResponse.json(
      {
        success: true,
        license: "CC BY-NC 4.0",
        boundingBoxes
      },
      { status: 200 }
    );

  }

  catch (err: any) {

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch bounding boxes"
      },
      { status: 500 }
    );

  }

}

export async function POST(req: NextRequest) {
  const apiToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expectedToken = process.env.API_TOKEN;
  const hasApiToken = !!apiToken && !!expectedToken && apiToken === expectedToken;

  if (!hasApiToken) {

    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized"
      },
      { status: 401 }
    );

  }

  try {
    const data: BoundingBoxData = await req.json();

    // Validate fields
    if (!data.name || !data.coordinates) {

      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields"
        },
        { status: 400 }
      );

    }

    // Validate format
    if (!Array.isArray(data.coordinates) || !Array.isArray(data.coordinates[0])) {

      return NextResponse.json(
        {
          success: false,
          error: "Invalid format"
        },
        { status: 400 }
      );

    }

    // Create bounding box
    const boundingBox = await BoundingBoxes.create(data);

    await logEndpointActivity({
      action: "boundingbox.create",
      route: "/api/boundingboxes",
      status: "success",
      actor: { source: "api" },
      metadata: {
        boundingBoxId: boundingBox.id,
        name: boundingBox.name,
      },
    });

    // Return
    return NextResponse.json(
      {
        success: true,
        boundingBox
      },
      { status: 201 }
    );

  }

  catch (err: any) {

    await logEndpointActivity({
      action: "boundingbox.create",
      route: "/api/boundingboxes",
      status: "failed",
      actor: { source: "api" },
      reason: err?.message ?? "Unknown error",
    });

    return NextResponse.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );

  }

}

export async function DELETE(req: NextRequest) {
  const apiToken = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expectedToken = process.env.API_TOKEN;
  const hasApiToken = !!apiToken && !!expectedToken && apiToken === expectedToken;

  if (!hasApiToken) {

    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized"
      },
      { status: 401 }
    );

  }

  try {
    const { id } = await req.json();

    // Validate id
    if (!id || typeof id !== 'number') {

      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid id"
        },
        { status: 400 }
      );

    }

    // Delete bounding box
    await BoundingBoxes.delete(id);

    await logEndpointActivity({
      action: "boundingbox.delete",
      route: "/api/boundingboxes",
      status: "success",
      actor: { source: "api" },
      metadata: { boundingBoxId: id },
    });

    // Return
    return NextResponse.json(
      {
        success: true,
        message: "Bounding box deleted"
      },
      { status: 200 }
    );

  }

  catch (err: any) {

    await logEndpointActivity({
      action: "boundingbox.delete",
      route: "/api/boundingboxes",
      status: "failed",
      actor: { source: "api" },
      reason: err?.message ?? "Unknown error",
    });

    return NextResponse.json(
      {
        success: false,
        error: err.message
      },
      { status: 500 }
    );

  }

}