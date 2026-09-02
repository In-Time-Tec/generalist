import { Effect, FileSystem, Path } from "effect"

interface RootedFileSystemOptions {
  readonly fileSystem: FileSystem.FileSystem
  readonly path: Path.Path
  readonly root: string
}

/** @internal Restrict Effect FileSystem path arguments to one sandbox-visible root. */
export const rootedFileSystem = ({ fileSystem, path, root }: RootedFileSystemOptions): FileSystem.FileSystem => {
  const resolvedRoot = path.resolve(root)
  const resolve = (input: string): string => path.join(resolvedRoot, path.resolve("/", input).slice(1))
  const visible = (input: string): string => `/${path.relative(resolvedRoot, input)}`
  const withRootDirectory = <A extends { readonly directory?: string | undefined }>(
    options: A | undefined,
  ): A | undefined =>
    options?.directory === undefined ? options : { ...options, directory: resolve(options.directory) }

  return FileSystem.makeNoop({
    ...fileSystem,
    access: (input, options) => fileSystem.access(resolve(input), options),
    chmod: (input, mode) => fileSystem.chmod(resolve(input), mode),
    chown: (input, uid, gid) => fileSystem.chown(resolve(input), uid, gid),
    copy: (from, to, options) => fileSystem.copy(resolve(from), resolve(to), options),
    copyFile: (from, to) => fileSystem.copyFile(resolve(from), resolve(to)),
    exists: (input) => fileSystem.exists(resolve(input)),
    glob: (pattern, options) =>
      fileSystem
        .glob(resolve(pattern), options?.root === undefined ? options : { ...options, root: resolve(options.root) })
        .pipe(Effect.map((matches) => matches.map(visible))),
    link: (from, to) => fileSystem.link(resolve(from), resolve(to)),
    makeDirectory: (input, options) => fileSystem.makeDirectory(resolve(input), options),
    makeTempDirectory: (options) => fileSystem.makeTempDirectory(withRootDirectory(options)).pipe(Effect.map(visible)),
    makeTempDirectoryScoped: (options) =>
      fileSystem.makeTempDirectoryScoped(withRootDirectory(options)).pipe(Effect.map(visible)),
    makeTempFile: (options) => fileSystem.makeTempFile(withRootDirectory(options)).pipe(Effect.map(visible)),
    makeTempFileScoped: (options) =>
      fileSystem.makeTempFileScoped(withRootDirectory(options)).pipe(Effect.map(visible)),
    open: (input, options) => fileSystem.open(resolve(input), options),
    readDirectory: (input, options) => fileSystem.readDirectory(resolve(input), options),
    readFile: (input) => fileSystem.readFile(resolve(input)),
    readFileString: (input, encoding) => fileSystem.readFileString(resolve(input), encoding),
    readLink: (input) => fileSystem.readLink(resolve(input)),
    realPath: (input) => fileSystem.realPath(resolve(input)).pipe(Effect.map(visible)),
    remove: (input, options) => fileSystem.remove(resolve(input), options),
    rename: (from, to) => fileSystem.rename(resolve(from), resolve(to)),
    sink: (input, options) => fileSystem.sink(resolve(input), options),
    stat: (input) => fileSystem.stat(resolve(input)),
    stream: (input, options) => fileSystem.stream(resolve(input), options),
    symlink: (from, to) => fileSystem.symlink(resolve(from), resolve(to)),
    truncate: (input, length) => fileSystem.truncate(resolve(input), length),
    utimes: (input, atime, mtime) => fileSystem.utimes(resolve(input), atime, mtime),
    watch: (input, options) => fileSystem.watch(resolve(input), options),
    writeFile: (input, data, options) => fileSystem.writeFile(resolve(input), data, options),
    writeFileString: (input, data, options) => fileSystem.writeFileString(resolve(input), data, options),
  })
}
