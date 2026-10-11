// Fills the signature blocks of docs/api.md from the compiler.
//
//   pnpm docs:api
//
// Each block sits between `<!-- GENERATED: name name … -->` and
// `<!-- /GENERATED -->`; the prose around them is written by hand and left
// alone. test/docs.test.ts fails when a block is stale.
import fs from 'node:fs'
import path from 'node:path'

import * as prettier from 'prettier'
import ts from 'typescript'

const root = path.join(import.meta.dirname, '..')
export const API_DOC = path.join(root, 'docs/api.md')
const indexFile = path.join(root, 'src/index.ts')

const BLOCK = /(<!-- GENERATED: ([^>]*?) -->\n)[\s\S]*?(<!-- \/GENERATED -->)/g

function loadProgram() {
  const configFile = path.join(root, 'tsconfig.json')
  const { config } = ts.readConfigFile(configFile, f => ts.sys.readFile(f)) as {
    config: unknown
  }
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, root)
  const program = ts.createProgram([indexFile], { ...options, noEmit: true })
  const checker = program.getTypeChecker()
  const module = checker.getSymbolAtLocation(program.getSourceFile(indexFile)!)!
  const symbols = new Map(
    checker.getExportsOfModule(module).map(s => [s.name, s] as const),
  )
  return { checker, symbols }
}

const printer = ts.createPrinter()

const isUndefined = (t: ts.TypeNode) =>
  t.kind === ts.SyntaxKind.UndefinedKeyword

// `opts?: FetchOptions | undefined` says the same thing twice
const dropOptionalUndefined: ts.TransformerFactory<ts.Node> = context => {
  const visit = (node: ts.Node): ts.Node => {
    const visited = ts.visitEachChild(node, visit, context)
    if (
      (ts.isParameter(visited) || ts.isPropertySignature(visited)) &&
      visited.questionToken &&
      visited.type &&
      ts.isUnionTypeNode(visited.type) &&
      visited.type.types.some(isUndefined)
    ) {
      const rest = visited.type.types.filter(t => !isUndefined(t))
      const type =
        rest.length === 1 ? rest[0]! : ts.factory.createUnionTypeNode(rest)
      return ts.isParameter(visited)
        ? ts.factory.updateParameterDeclaration(
            visited,
            visited.modifiers,
            visited.dotDotDotToken,
            visited.name,
            visited.questionToken,
            type,
            visited.initializer,
          )
        : ts.factory.updatePropertySignature(
            visited,
            visited.modifiers,
            visited.name,
            visited.questionToken,
            type,
          )
    }
    return visited
  }
  return visit
}

function print(node: ts.Node, file?: ts.SourceFile) {
  const [out] = ts.transform(node, [dropOptionalUndefined]).transformed
  return printer.printNode(
    ts.EmitHint.Unspecified,
    out!,
    file ?? ts.createSourceFile('x.ts', '', ts.ScriptTarget.Latest),
  )
}

function withoutExport(modifiers: ts.NodeArray<ts.ModifierLike> | undefined) {
  return modifiers?.filter(m => m.kind !== ts.SyntaxKind.ExportKeyword)
}

function noLeadingComment<T extends ts.Node>(node: T) {
  return ts.setEmitFlags(node, ts.EmitFlags.NoLeadingComments)
}

function renderFunction(
  checker: ts.TypeChecker,
  name: string,
  signature: ts.Signature,
) {
  const decl = checker.signatureToSignatureDeclaration(
    signature,
    ts.SyntaxKind.FunctionDeclaration,
    undefined,
    ts.NodeBuilderFlags.NoTruncation |
      ts.NodeBuilderFlags.UseSingleQuotesForStringLiteralType,
  ) as ts.FunctionDeclaration
  const parameters = decl.parameters.map(p =>
    ts.isIdentifier(p.name)
      ? p
      : ts.factory.updateParameterDeclaration(
          p,
          p.modifiers,
          p.dotDotDotToken,
          ts.factory.createIdentifier('options'),
          p.questionToken,
          p.type,
          p.initializer,
        ),
  )
  return print(
    ts.factory.updateFunctionDeclaration(
      decl,
      undefined,
      undefined,
      ts.factory.createIdentifier(name),
      decl.typeParameters,
      parameters,
      decl.type,
      undefined,
    ),
  )
}

function render(checker: ts.TypeChecker, symbol: ts.Symbol) {
  const decl = symbol.declarations?.[0]
  const name = symbol.name
  if (!decl) {
    throw new Error(`no declaration for ${name}`)
  }
  const file = decl.getSourceFile()
  if (ts.isInterfaceDeclaration(decl)) {
    return print(
      noLeadingComment(
        ts.factory.updateInterfaceDeclaration(
          decl,
          withoutExport(decl.modifiers),
          decl.name,
          decl.typeParameters,
          decl.heritageClauses,
          decl.members,
        ),
      ),
      file,
    )
  }
  if (ts.isTypeAliasDeclaration(decl)) {
    return print(
      noLeadingComment(
        ts.factory.updateTypeAliasDeclaration(
          decl,
          withoutExport(decl.modifiers),
          decl.name,
          decl.typeParameters,
          decl.type,
        ),
      ),
      file,
    )
  }
  if (ts.isClassDeclaration(decl)) {
    const members = decl.members.flatMap(m =>
      ts.isPropertyDeclaration(m)
        ? [m.getText(file)]
        : ts.isConstructorDeclaration(m)
          ? [
              `constructor(${m.parameters.map(p => p.getText(file)).join(', ')})`,
            ]
          : [],
    )
    const heritage = decl.heritageClauses?.map(h => h.getText(file)) ?? []
    return [`class ${name}`, ...heritage, `{\n${members.join('\n')}\n}`].join(
      ' ',
    )
  }
  const type = checker.getTypeOfSymbolAtLocation(symbol, decl)
  const [signature] = type.getCallSignatures()
  if (signature) {
    return renderFunction(checker, name, signature)
  }
  if (ts.isVariableDeclaration(decl)) {
    const annotation =
      decl.type?.getText(file) ??
      checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
    return `const ${name}: ${annotation}`
  }
  throw new Error(`cannot render ${name} (${ts.SyntaxKind[decl.kind]})`)
}

export async function renderApiDoc(markdown: string) {
  const { checker, symbols } = loadProgram()
  const filled = markdown.replaceAll(
    BLOCK,
    (_match, open: string, names: string, close: string) => {
      const declarations = names
        .split(/\s+/)
        .filter(n => n !== '')
        .map(n => {
          const symbol = symbols.get(n)
          if (!symbol) {
            throw new Error(`${n} is not exported from src/index.ts`)
          }
          return render(
            checker,
            symbol.flags & ts.SymbolFlags.Alias
              ? checker.getAliasedSymbol(symbol)
              : symbol,
          )
        })
      return `${open}\n\`\`\`ts\n${declarations.join('\n\n')}\n\`\`\`\n\n${close}`
    },
  )
  const options = await prettier.resolveConfig(API_DOC)
  return prettier.format(filled, { ...options, filepath: API_DOC })
}

if (import.meta.main) {
  const current = fs.readFileSync(API_DOC, 'utf8')
  fs.writeFileSync(API_DOC, await renderApiDoc(current))
}
