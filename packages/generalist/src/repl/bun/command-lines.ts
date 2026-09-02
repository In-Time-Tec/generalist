/** Split a Bun descriptor stream into newline-delimited commands. */
export const commandLines = (fd: number): AsyncIterableIterator<string> => {
  let buffered = ""
  const stream = Bun.file(fd)
    .stream()
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform: (chunk, controller) => {
          buffered += chunk
          let newline = buffered.indexOf("\n")
          while (newline >= 0) {
            controller.enqueue(buffered.slice(0, newline))
            buffered = buffered.slice(newline + 1)
            newline = buffered.indexOf("\n")
          }
        },
      }),
    )
  return stream[Symbol.asyncIterator]()
}
