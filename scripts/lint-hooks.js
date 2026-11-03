/**
 * NetMask React Rules of Hooks AST Static Analyzer
 *
 * Verifies that:
 * 1. React hooks (use*) are NEVER called inside conditionals (if, loops, switch, try/catch).
 * 2. React hooks (use*) are NEVER called after an early return statement (including `if (...) return`) in any component.
 *
 * Uses TypeScript compiler AST parser (zero extra dependencies).
 */

const fs = require('fs')
const path = require('path')
const ts = require('typescript')

function findFiles(dir, exts = ['.tsx', '.ts'], list = []) {
  if (!fs.existsSync(dir)) return list
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item)
    if (fs.statSync(full).isDirectory()) {
      findFiles(full, exts, list)
    } else if (exts.some(ext => full.endsWith(ext))) {
      list.push(full)
    }
  }
  return list
}

function isHookCall(node) {
  if (!ts.isCallExpression(node)) return null
  const expr = node.expression
  let name = ''
  if (ts.isIdentifier(expr)) {
    name = expr.text
  } else if (ts.isPropertyAccessExpression(expr)) {
    name = expr.name.text
  }

  // Hook pattern: starts with 'use', followed by uppercase letter or standard React hook
  if (name.startsWith('use') && name.length > 3 && /^[A-Z]/.test(name[3])) {
    return name
  }
  return null
}

function findEarlyReturn(node) {
  if (ts.isReturnStatement(node)) {
    return node
  }
  if (ts.isIfStatement(node)) {
    const inThen = findEarlyReturn(node.thenStatement)
    if (inThen) return inThen
    if (node.elseStatement) {
      const inElse = findEarlyReturn(node.elseStatement)
      if (inElse) return inElse
    }
  }
  if (ts.isBlock(node)) {
    for (const stmt of node.statements) {
      const ret = findEarlyReturn(stmt)
      if (ret) return ret
    }
  }
  return null
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
  const violations = []

  function checkFunction(funcNode) {
    if (!funcNode.body || !ts.isBlock(funcNode.body)) return

    let hasReturn = false
    let returnLine = 0

    for (const stmt of funcNode.body.statements) {
      function checkConditionals(node, contextName) {
        // Do not recurse into inner function declarations/expressions
        if (node !== stmt && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))) {
          return
        }

        const hook = isHookCall(node)
        if (hook) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
          violations.push({
            file: filePath,
            line,
            hook,
            reason: `Hook '${hook}' is called conditionally inside a ${contextName}. Hooks must be called unconditionally at top level.`
          })
        }
        ts.forEachChild(node, child => checkConditionals(child, contextName))
      }

      if (ts.isIfStatement(stmt)) {
        checkConditionals(stmt, 'if statement')
      } else if (ts.isTryStatement(stmt)) {
        checkConditionals(stmt, 'try/catch statement')
      } else if (ts.isSwitchStatement(stmt)) {
        checkConditionals(stmt, 'switch statement')
      } else if (ts.isIterationStatement(stmt, false)) {
        checkConditionals(stmt, 'loop')
      }

      if (hasReturn && !ts.isFunctionDeclaration(stmt) && !ts.isFunctionExpression(stmt) && !ts.isArrowFunction(stmt)) {
        // If an early return already occurred in the component body, no hooks can be called after it
        function checkHooksAfterReturn(node) {
          if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
            return
          }
          const hook = isHookCall(node)
          if (hook) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1
            violations.push({
              file: filePath,
              line,
              hook,
              reason: `Hook '${hook}' is called on line ${line} AFTER a return statement on line ${returnLine}. React Rules of Hooks prohibit hooks after returns.`
            })
          }
          ts.forEachChild(node, checkHooksAfterReturn)
        }
        checkHooksAfterReturn(stmt)
      }

      // Check if this statement contains an early return
      const retNode = findEarlyReturn(stmt)
      if (retNode) {
        hasReturn = true
        returnLine = sourceFile.getLineAndCharacterOfPosition(retNode.getStart()).line + 1
      }
    }
  }

  function walk(node) {
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      checkFunction(node)
    }
    ts.forEachChild(node, walk)
  }

  walk(sourceFile)
  return violations
}

function run() {
  const targetDir = path.resolve(__dirname, '../src/renderer/src')
  const files = findFiles(targetDir, ['.tsx'])

  console.log(`\n🔍 NetMask React Rules of Hooks AST Scanner`)
  console.log(`Checking ${files.length} React components in ${targetDir}...\n`)

  let totalViolations = 0

  for (const file of files) {
    const rel = path.relative(path.resolve(__dirname, '..'), file)
    const violations = scanFile(file)
    if (violations.length > 0) {
      totalViolations += violations.length
      console.error(`❌ ${rel}:`)
      for (const v of violations) {
        console.error(`   Line ${v.line}: [${v.hook}] ${v.reason}`)
      }
    }
  }

  if (totalViolations > 0) {
    console.error(`\n💥 FAILED: Found ${totalViolations} React Rules of Hooks violation(s)!`)
    process.exit(1)
  } else {
    console.log(`✅ All ${files.length} React components strictly comply with React Rules of Hooks (0 violations).`)
  }
}

if (require.main === module) {
  run()
}

module.exports = { scanFile, isHookCall, findEarlyReturn }
