import { inertHtml as ih } from "foldkit/html"

const h = ih

export const notFound = () =>
  h.main(
    [h.Id("main-content"), h.Class("mx-auto flex min-h-[60vh] max-w-3xl flex-col justify-center px-4 py-16 sm:px-6")],
    [
      h.p([h.Class("text-sm font-medium text-muted-foreground")], ["404"]),
      h.h1([h.Class("mt-3 text-3xl font-semibold tracking-tight")], ["Page not found"]),
      h.p([h.Class("mt-4 text-muted-foreground")], ["The requested Generalist docs page does not exist."]),
      h.a(
        [h.Href("/docs/start/quickstart"), h.Class("mt-6 font-medium text-primary underline underline-offset-4")],
        ["Open the quickstart"],
      ),
    ],
  )
