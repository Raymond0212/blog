import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

export default function SideFooter() {
  return (
    <footer className="border-t border-border py-2 dark:border-border md:px-4 md:py-0">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
        <HoverCard>
          <div className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built by{" "}
            <HoverCardTrigger asChild>
              <a
                href="https://github.com/Raymond0212"
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                RuaMond
              </a>
            </HoverCardTrigger>
            .
            <HoverCardContent className="w-80">
              <div className="flex justify-between space-x-4">
                <div className="space-y-1">
                  <p className="text-sm">Supported by my girlfriend @醨苒.</p>
                  <div className="flex items-center pt-2">
                    <span className="text-xs text-muted-foreground">
                      Last updated at{" "}
                      {new Date(document.lastModified).toLocaleDateString()}.
                    </span>
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </div>
        </HoverCard>
      </div>
    </footer>
  );
}
