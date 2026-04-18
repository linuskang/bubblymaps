export function Footer() {
    return (
        <footer className="border-t border-border py-6">
            <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
                <span>© {new Date().getFullYear()} Linus Kang</span>
                <div className="flex items-center gap-4">
                    <a href="https://lkang.au/privacy" className="hover:text-foreground transition-colors">Privacy</a>
                    <a href="https://lkang.au/terms" className="hover:text-foreground transition-colors">Terms</a>
                </div>
            </div>
        </footer>
    );
}
