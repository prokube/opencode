import { codeToHtml, bundledLanguages } from "shiki"
import { createResource, Suspense } from "solid-js"
import { transformerNotationDiff } from "@shikijs/transformers"
import "./content-code.css"

interface Props {
  code: string
  lang?: string
  flush?: boolean
}

export function ContentCode(props: Props) {
  const [html] = createResource(
    () => [props.code, props.lang],
    async ([code, lang]) => {
      return (await codeToHtml(code || "", {
        lang: lang && lang in bundledLanguages ? lang : "text",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
        transformers: [transformerNotationDiff()],
      })) as string
    },
  )

  return (
    <Suspense
      fallback={
        <pre class="content-code" data-flush={props.flush === true ? true : undefined}>
          {props.code}
        </pre>
      }
    >
      <div innerHTML={html()} class="content-code" data-flush={props.flush === true ? true : undefined} />
    </Suspense>
  )
}
