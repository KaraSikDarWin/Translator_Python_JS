let loop_flag_id = 0;
const patterns = [
  { type: 'COMMENT', regex: /^#.*(\n|$)/ },
  { type: 'STRING', regex: /^([fF]?)(['"])(.*?)\2/ },
  { type: 'KEYWORD', regex: /^(False|None|True|and|as|await|break|class|continue|def|del|elif|else|except|for|from|global|if|import|in|not|or|pass|return|try|while)\b/ },
  { type: 'IDENTIFIER', regex: /^[A-Za-z_][A-Za-z0-9_]*/ },
  { type: 'NUMBER', regex: /^\d+(\.\d+)?/ },
  { type: 'OPERATOR', regex: /^(==|!=|<=|>=|\+=|-=|\*=|\/=|%=|\*\*|\*\*=|\/\/|\/\/=|>>|<<|>>=|<<=|=|<|>|\+|-|\*|\/|%)/ },
  { type: 'DELIMITER', regex: /^[()\[\]:,;]/ },
  { type: 'DOT', regex: /^\./ },
  { type: 'NEWLINE', regex: /^\n/ },
  { type: 'WHITESPACE', regex: /^[ \t]+/ },
];
function tokenize(code) {
  const tokens = [];
  let input = code;
  let indentStack = [0];
  let atLineStart = true;
  while (input.length > 0) {
    let matched = false;
    for (const { type, regex } of patterns) {
      const match = regex.exec(input);
      if (!match) continue;
      matched = true;
      const value = match[0];
      if (type === 'NEWLINE') {
        tokens.push(['NEWLINE', '\n']);
        atLineStart = true;
        const indentMatch = /^[ \t]*/.exec(input.slice(value.length));
        if (indentMatch) {
          const indentValue = indentMatch[0];
          const currentIndent = indentValue.replace(/\t/g, ' ').length;
          const prevIndent = indentStack[indentStack.length - 1];
          if (currentIndent > prevIndent) {
            indentStack.push(currentIndent);
            tokens.push(['INDENT', currentIndent]);
          } else if (currentIndent < prevIndent) {
            while (indentStack.length > 1 && currentIndent < indentStack[indentStack.length - 1]) {
              const popped = indentStack.pop();
              tokens.push(['DEDENT', popped]);
            }
          }
          input = input.slice(value.length + indentValue.length);
        } else {
          input = input.slice(value.length);
        }
        break;
      }
      if (type === 'COMMENT') {
        input = input.slice(value.length);
        break;
      }
      if (type === 'STRING') {
        const prefix = match[1];
        const content = match[3];
        const actualType = prefix.toLowerCase() === 'f' ? 'FSTRING' : 'STRING';
        tokens.push([actualType, content]);
        input = input.slice(value.length);
        break;
      }
      if (type !== 'WHITESPACE') {
        tokens.push([type, value]);
        atLineStart = false;
      }
      input = input.slice(value.length);
      break;
    }
    if (!matched) {
      tokens.push(['ERROR', input[0]]);
      input = input.slice(1);
      atLineStart = false;
    }
  }
  while (indentStack.length > 1) {
    const popped = indentStack.pop();
    tokens.push(['DEDENT', popped]);
  }
  return tokens;
}
function tokenizeExpression(input) {
  const tokens = [];
  while (input.length > 0) {
    let matched = false;
    for (const { type, regex } of patterns) {
      const match = regex.exec(input);
      if (!match) continue;
      matched = true;
      const value = match[0];
      if (type === 'NEWLINE' || type === 'COMMENT') {
        input = input.slice(value.length);
        break;
      }
      if (type === 'STRING') {
        const prefix = match[1];
        const content = match[3];
        const actualType = prefix.toLowerCase() === 'f' ? 'FSTRING' : 'STRING';
        tokens.push([actualType, content]);
      } else if (type !== 'WHITESPACE') {
        tokens.push([type, value]);
      }
      input = input.slice(value.length);
      break;
    }
    if (!matched) {
      tokens.push(['ERROR', input[0]]);
      input = input.slice(1);
    }
  }
  return tokens;
}
function containsBreak(node) {
  if (!node) return false;
  if (node.type === 'BreakStatement') return true;
  let keys = [];
  switch (node.type) {
    case 'Program':
    case 'FunctionDef':
    case 'ClassDef':
    case 'IfStatement':
      keys = ['body', 'alternate'];
      break;
    case 'ForStatement':
    case 'WhileStatement':
      keys = ['body', 'orelse'];
      break;
    case 'ReturnStatement':
      keys = ['value'];
      break;
    case 'ExpressionStatement':
      keys = ['expression'];
      break;
    case 'Assignment':
    case 'AugmentedAssignment':
      keys = ['value'];
      break;
    case 'BinaryExpression':
    case 'UnaryExpression':
      keys = ['left', 'right', 'argument'];
      break;
    case 'CallExpression':
      keys = ['callee', 'arguments'];
      break;
    case 'MemberExpression':
      keys = ['object', 'property'];
      break;
    case 'ListLiteral':
      keys = ['elements'];
      break;
    default:
      return false;
  }
  for (let key of keys) {
    let child = node[key];
    if (Array.isArray(child)) {
      if (child.some(containsBreak)) return true;
    } else if (containsBreak(child)) return true;
  }
  return false;
}
function createParser(tokens) {
  let position = 0;
  function peek() {
    return tokens[position] || ['EOF', null];
  }
  function next() {
    return tokens[position++] || ['EOF', null];
  }
  function expect(type, value = null) {
    const [tokType, tokValue] = next();
    if (tokType !== type || (value !== null && tokValue !== value)) {
      throw new Error(`Expected ${type} ${value ?? ''}, but got ${tokType} ${tokValue}`);
    }
    return tokValue;
  }
  function parseFStringContent(content) {
    const quasis = [];
    const expressions = [];
    let currentQuasi = '';
    let i = 0;
    while (i < content.length) {
      if (content[i] === '{') {
        if (i + 1 < content.length && content[i + 1] === '{') {
          currentQuasi += '{';
          i += 2;
          continue;
        }
        quasis.push(currentQuasi);
        currentQuasi = '';
        i++;
        const startPos = i;
        let depth = 1;
        while (i < content.length) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') {
            depth--;
            if (depth === 0) break;
          }
          i++;
        }
        if (depth !== 0) throw new Error('Unclosed { in f-string');
        const exprStr = content.slice(startPos, i);
        const exprTokens = tokenizeExpression(exprStr);
        const subParser = createParser(exprTokens);
        const expr = subParser.parseExpression();
        expressions.push(expr);
        i++;
      } else if (content[i] === '}') {
        if (i + 1 < content.length && content[i + 1] === '}') {
          currentQuasi += '}';
          i += 2;
          continue;
        } else {
          throw new Error('Unmatched } in f-string');
        }
      } else {
        currentQuasi += content[i];
        i++;
      }
    }
    quasis.push(currentQuasi);
    return { quasis, expressions };
  }
  function parseProgram() {
    const body = [];
    while (position < tokens.length) {
      if (peek()[0] === 'DEDENT') {
        next(); // skip DEDENT
        continue;
      }
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    return { type: 'Program', body };
  }
  function parseStatement() {
    const [type, value] = peek();
 
    if (type === 'NEWLINE') {
      next();
      return null;
    }
 
    if (type === 'KEYWORD') {
      switch (value) {
        case 'def': return parseFunction();
        case 'class': return parseClass();
        case 'return': return parseReturn();
        case 'if': return parseIf();
        case 'for': return parseFor();
        case 'while': return parseWhile();
        case 'import': return parseImport();
        case 'break': next(); return { type: 'BreakStatement' };
        case 'continue': next(); return { type: 'ContinueStatement' };
        case 'pass': next(); return { type: 'PassStatement' };
      }
    }
   
    if (type === 'IDENTIFIER') {
      const expr = parseExpression();
      if (peek()[0] === 'OPERATOR' && peek()[1].endsWith('=')) {
        const [opType, opValue] = next();
        const right = parseExpression();
        if (expr.type !== 'Identifier') {
          throw new Error('Assignment target must be an identifier');
        }
        if (opValue === '=') {
          return { type: 'Assignment', name: expr.name, value: right };
        } else {
          return { type: 'AugmentedAssignment', name: expr.name, operator: opValue.slice(0, -1), value: right };
        }
      } else {
        return { type: 'ExpressionStatement', expression: expr };
      }
    } else if (type === 'OPERATOR') {
      const expr = parseExpression();
      return { type: 'ExpressionStatement', expression: expr };
    }
 
    throw new Error(`Unknown statement starting with ${type} ${value}`);
  }
  function parseImport() {
    expect('KEYWORD', 'import');
    const module = expect('IDENTIFIER');
    return { type: 'ImportDeclaration', module };
  }
  function parseBlock() {
    expect('DELIMITER', ':');
    expect('NEWLINE');
    expect('INDENT');
   
    const body = [];
    while (peek()[0] !== 'DEDENT' && position < tokens.length) {
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    if (peek()[0] === 'DEDENT') {
      next();
    }
   
    return body;
  }
  function parseIf() {
    expect('KEYWORD', 'if');
    const test = parseExpression();
    const body = parseBlock();
   
    const elifs = [];
    while (peek()[0] === 'KEYWORD' && peek()[1] === 'elif') {
      next();
      const elifTest = parseExpression();
      const elifBody = parseBlock();
      elifs.push({ test: elifTest, body: elifBody });
    }
   
    let elseBody = null;
    if (peek()[0] === 'KEYWORD' && peek()[1] === 'else') {
      next();
      elseBody = parseBlock();
    }
   
    let alternate = elseBody;
    for (let i = elifs.length - 1; i >= 0; i--) {
      alternate = { type: 'IfStatement', test: elifs[i].test, body: elifs[i].body, alternate };
    }
   
    return {
      type: 'IfStatement',
      test,
      body,
      alternate
    };
  }
  function parseFor() {
    expect('KEYWORD', 'for');
    const target = parsePrimary();
    expect('KEYWORD', 'in');
    const iter = parseExpression();
    const body = parseBlock();
   
    let orelse = [];
    if (peek()[0] === 'KEYWORD' && peek()[1] === 'else') {
      next();
      orelse = parseBlock();
    }
   
    return {
      type: 'ForStatement',
      target,
      iter,
      body,
      orelse
    };
  }
  function parseWhile() {
    expect('KEYWORD', 'while');
    const test = parseExpression();
    const body = parseBlock();
   
    let orelse = [];
    if (peek()[0] === 'KEYWORD' && peek()[1] === 'else') {
      next();
      orelse = parseBlock();
    }
   
    return {
      type: 'WhileStatement',
      test,
      body,
      orelse
    };
  }
  function parseFunction() {
    expect('KEYWORD', 'def');
    const name = expect('IDENTIFIER');
    expect('DELIMITER', '(');
    const params = [];
    if (peek()[0] !== 'DELIMITER' || peek()[1] !== ')') {
      params.push(expect('IDENTIFIER'));
      while (peek()[1] === ',') {
        next();
        params.push(expect('IDENTIFIER'));
      }
    }
    expect('DELIMITER', ')');
    const body = parseBlock();
   
    return { type: 'FunctionDef', name, params, body };
  }
  function parseClass() {
    expect('KEYWORD', 'class');
    const name = expect('IDENTIFIER');
    expect('DELIMITER', ':');
    expect('NEWLINE');
    expect('INDENT');
    const body = [];
    while (peek()[0] !== 'DEDENT' && position < tokens.length) {
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
    }
    if (peek()[0] === 'DEDENT') {
      next();
    }
    return { type: 'ClassDef', name, body };
  }
  function parseReturn() {
    expect('KEYWORD', 'return');
    const expr = parseExpression();
    return { type: 'ReturnStatement', value: expr };
  }
  function parseExpression(minPrecedence = 0) {
    let left = parseUnary();
    while (true) {
      const [type, value] = peek();
      if (!(type === 'OPERATOR' || (type === 'KEYWORD' && (value === 'and' || value === 'or')))) {
        break;
      }
      const precedence = PRECEDENCE[value];
      if (precedence === undefined || precedence < minPrecedence) {
        break;
      }
      next();
      let right = parseExpression(precedence + 1);
      left = {
        type: 'BinaryExpression',
        operator: value,
        left,
        right,
      };
    }
    return left;
  }
  function parseUnary() {
    const [type, op] = peek();
    if (type === 'OPERATOR' && (op === '-' || op === '+')) {
      next();
      const argument = parseUnary();
      return { type: 'UnaryExpression', operator: op, argument };
    } else if (type === 'KEYWORD' && op === 'not') {
      next();
      const argument = parseUnary();
      return { type: 'UnaryExpression', operator: 'not', argument };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    let expr = parseAtom();
    while (peek()[0] === 'DOT') {
      next();
      const property = expect('IDENTIFIER');
      expr = { type: 'MemberExpression', object: expr, property: { type: 'Identifier', name: property } };
    }
    while (peek()[0] === 'DELIMITER' && peek()[1] === '(') {
      next();
      const args = [];
      if (peek()[0] !== 'DELIMITER' || peek()[1] !== ')') {
        args.push(parseExpression());
        while (peek()[0] === 'DELIMITER' && peek()[1] === ',') {
          next();
          args.push(parseExpression());
        }
      }
      expect('DELIMITER', ')');
      expr = { type: 'CallExpression', callee: expr, arguments: args };
    }
    return expr;
  }
  function parseAtom() {
    const [type, value] = peek();
    if (type === 'NUMBER') {
      next();
      return { type: 'Literal', value: Number(value), kind: 'number' };
    } else if (type === 'STRING') {
      next();
      return { type: 'Literal', value, kind: 'string' };
    } else if (type === 'FSTRING') {
      next();
      const { quasis, expressions } = parseFStringContent(value);
      return { type: 'TemplateLiteral', quasis, expressions };
    } else if (type === 'IDENTIFIER') {
      next();
      return { type: 'Identifier', name: value };
    } else if (type === 'DELIMITER' && value === '(') {
      next();
      const expr = parseExpression();
      expect('DELIMITER', ')');
      return expr;
    } else if (type === 'DELIMITER' && value === '[') {
      next();
      const elements = [];
      if (peek()[0] !== 'DELIMITER' || peek()[1] !== ']') {
        elements.push(parseExpression());
        while (peek()[0] === 'DELIMITER' && peek()[1] === ',') {
          next();
          if (peek()[0] === 'DELIMITER' && peek()[1] === ']') break; // trailing comma
          elements.push(parseExpression());
        }
      }
      expect('DELIMITER', ']');
      return { type: 'ListLiteral', elements };
    }
    throw new Error(`Unexpected token: ${type} ${value}`);
  }
  return { parseProgram, parseExpression, parseStatement, parseIf, parseFor, parseWhile, parseFunction, parseClass, parseReturn, parseBlock, parseImport, parsePrimary, parseUnary, parseAtom };
}
function parse(tokens) {
  const parser = createParser(tokens);
  return parser.parseProgram();
}
const PRECEDENCE = {
  '**': 10,
  '*': 9,
  '/': 9,
  '%': 9,
  '+': 8,
  '-': 8,
  '>': 7,
  '<': 7,
  '>=': 7,
  '<=': 7,
  '==': 7,
  '!=': 7,
  'and': 6,
  'or': 5,
};
function getLiteralType(node) {
  if (node && node.type === 'Literal') {
    return node.kind;
  }
  return null;
}
function generateJS(node, indent = 0, context = { isClass: false, loop_flag: null }) {
  if (!node || typeof node !== 'object') return '';
  const pad = ' '.repeat(indent);
  switch (node.type) {
    case 'Program':
      return node.body
        .filter(Boolean)
        .map(stmt => generateJS(stmt, indent, context))
        .filter(Boolean)
        .join('\n');
    case 'Assignment': {
      const valueStr = generateJS(node.value, 0, context);
      let assignStr;
      if (context.isClass) {
        assignStr = `static ${node.name} = ${valueStr};`;
      } else {
        assignStr = `${node.name} = ${valueStr};`;
      }
      return pad + assignStr;
    }
    case 'AugmentedAssignment': {
      const valueStr = generateJS(node.value, 0, context);
      return pad + `${node.name} ${node.operator}= ${valueStr};`;
    }
    case 'ExpressionStatement':
      return pad + `${generateJS(node.expression, 0, context)};`;
    case 'BinaryExpression': {
      const leftType = getLiteralType(node.left);
      const rightType = getLiteralType(node.right);
      if (node.operator === '/' || node.operator === '//') {
        if (rightType === 'number' && node.right.value === 0) {
          throw new Error('Division by zero detected');
        }
      }
      if (node.operator === '+') {
        if ((leftType === 'string' && rightType === 'number') || (leftType === 'number' && rightType === 'string')) {
          throw new Error('Addition of string and number detected');
        }
      }
      let operator = node.operator;
      if (operator === 'and') operator = '&&';
      else if (operator === 'or') operator = '||';
      else if (operator === '//') operator = '/'; // Note: This approximates floor division; for exact, use Math.floor(left / right)
      return `${generateJS(node.left, 0, context)} ${operator} ${generateJS(node.right, 0, context)}`;
    }
    case 'UnaryExpression': {
      let operator = node.operator;
      if (operator === 'not') operator = '!';
      return `${operator}${generateJS(node.argument, 0, context)}`;
    }
    case 'Identifier':
      return node.name;
    case 'Literal':
      if (node.kind === 'string') {
        return JSON.stringify(node.value);
      } else {
        return node.value;
      }
    case 'TemplateLiteral': {
      let code = '`';
      for (let j = 0; j < node.expressions.length; j++) {
        code += node.quasis[j].replace(/`/g, '\\`').replace(/\${/g, '\\${');
        code += '${' + generateJS(node.expressions[j], 0, context) + '}';
      }
      code += node.quasis[node.expressions.length].replace(/`/g, '\\`').replace(/\${/g, '\\${');
      code += '`';
      return code;
    }
    case 'MemberExpression':
      return `${generateJS(node.object, 0, context)}.${generateJS(node.property, 0, context)}`;
    case 'CallExpression':
      const callee = generateJS(node.callee, 0, context);
      const args = node.arguments.map(arg => generateJS(arg, 0, context)).join(', ');
      if (callee === 'print') {
        return `console.log(${args})`;
      } else if (callee === 'input') {
        return `prompt(${args})`;
      } else if (callee === 'int') {
        return `parseInt(${args})`;
      } else if (callee === 'float') {
        return `parseFloat(${args})`;
      } else if (callee === 'str') {
        return `String(${args})`;
      }
      return `${callee}(${args})`;
    case 'ReturnStatement':
      return pad + `return ${generateJS(node.value, 0, context)};`;
    case 'FunctionDef': {
      const params = node.params.join(', ');
      const newContext = { isClass: false };
      const bodyStr = node.body
        .filter(Boolean)
        .map(stmt => generateJS(stmt, indent + 1, newContext))
        .filter(Boolean)
        .join('\n');
      const funcHeader = context.isClass ? `${node.name}(${params}) {` : `function ${node.name}(${params}) {`;
      return pad + funcHeader + `\n${bodyStr}\n${pad}}`;
    }
    case 'IfStatement': {
      const test = generateJS(node.test, 0, context);
      const body = node.body
        .filter(Boolean)
        .map(stmt => generateJS(stmt, indent + 1, context))
        .filter(Boolean)
        .join('\n');
      let code = pad + `if (${test}) {\n${body}\n${pad}}`;
      if (node.alternate) {
        let current = node.alternate;
        while (current && current.type === 'IfStatement') {
          const elifTest = generateJS(current.test, 0, context);
          const elifBody = current.body
            .filter(Boolean)
            .map(stmt => generateJS(stmt, indent + 1, context))
            .filter(Boolean)
            .join('\n');
          code += ` else if (${elifTest}) {\n${elifBody}\n${pad}}`;
          current = current.alternate;
        }
        if (current && Array.isArray(current) && current.length > 0) {
          const elseBody = current
            .filter(Boolean)
            .map(stmt => generateJS(stmt, indent + 1, context))
            .filter(Boolean)
            .join('\n');
          code += ` else {\n${elseBody}\n${pad}}`;
        }
      }
      return code;
    }
    case 'WhileStatement': {
      const has_break = node.body.some(containsBreak);
      let flag_code = '';
      let if_completed = '';
      let new_context = { ...context };
      let elseBody = '';
      if (node.orelse && node.orelse.length > 0) {
        elseBody = node.orelse
          .filter(Boolean)
          .map(stmt => generateJS(stmt, indent + 1, context))
          .filter(Boolean)
          .join('\n');
        if (has_break) {
          loop_flag_id++;
          const flag = `_loop_completed_${loop_flag_id}`;
          flag_code = pad + `let ${flag} = true;\n`;
          new_context.loop_flag = flag;
          if_completed = pad + `if (${flag}) {\n${elseBody}\n${pad}}\n`;
        } else {
          if_completed = elseBody;
        }
      }
      const test = generateJS(node.test, 0, context);
      const body = node.body
        .filter(Boolean)
        .map(stmt => generateJS(stmt, indent + 1, new_context))
        .filter(Boolean)
        .join('\n');
      let code = flag_code + pad + `while (${test}) {\n${body}\n${pad}}` + if_completed;
      return code;
    }
    case 'ForStatement': {
      const has_break = node.body.some(containsBreak);
      let flag_code = '';
      let if_completed = '';
      let new_context = { ...context };
      let elseBody = '';
      if (node.orelse && node.orelse.length > 0) {
        elseBody = node.orelse
          .filter(Boolean)
          .map(stmt => generateJS(stmt, indent + 1, context))
          .filter(Boolean)
          .join('\n');
        if (has_break) {
          loop_flag_id++;
          const flag = `_loop_completed_${loop_flag_id}`;
          flag_code = pad + `let ${flag} = true;\n`;
          new_context.loop_flag = flag;
          if_completed = pad + `if (${flag}) {\n${elseBody}\n${pad}}\n`;
        } else {
          if_completed = elseBody + '\n';
        }
      }
      let loop_code;
      const target = generateJS(node.target, 0, context);
      if (node.iter.type === 'CallExpression' && node.iter.callee.name === 'range') {
        const args = node.iter.arguments;
        let start = '0';
        let stop;
        let step = '1';
        if (args.length === 1) {
          stop = generateJS(args[0], 0, context);
        } else if (args.length === 2) {
          start = generateJS(args[0], 0, context);
          stop = generateJS(args[1], 0, context);
        } else if (args.length === 3) {
          start = generateJS(args[0], 0, context);
          stop = generateJS(args[1], 0, context);
          step = generateJS(args[2], 0, context);
        } else {
          return pad + `/* Unsupported range arguments */`;
        }
        const stepStr = step.replace(/\s/g, '');
        const stepSign = stepStr.startsWith('-') ? -1 : 1;
        const op = stepSign > 0 ? '<' : '>';
        const absStep = stepSign < 0 ? stepStr.slice(1) : stepStr;
        const inc = stepSign > 0 ? `+= ${absStep}` : `-= ${absStep}`;
        const bodyStr = node.body
          .filter(Boolean)
          .map(stmt => generateJS(stmt, indent + 1, new_context))
          .filter(Boolean)
          .join('\n');
        loop_code = pad + `for (var ${target} = ${start}; ${target} ${op} ${stop}; ${target} ${inc}) {\n${bodyStr}\n${pad}}`;
      } else {
        const iter = generateJS(node.iter, 0, context);
        const bodyStr = node.body
          .filter(Boolean)
          .map(stmt => generateJS(stmt, indent + 1, new_context))
          .filter(Boolean)
          .join('\n');
        loop_code = pad + `for (var ${target} of ${iter}) {\n${bodyStr}\n${pad}}`;
      }
      return flag_code + loop_code + if_completed;
    }
    case 'ClassDef': {
      const newContext = { isClass: true };
      const body = node.body
        .filter(Boolean)
        .map(stmt => generateJS(stmt, indent + 1, newContext))
        .filter(Boolean)
        .join('\n');
      return pad + `class ${node.name} {\n${body}\n${pad}}`;
    }
    case 'ImportDeclaration':
      return pad + `// import ${node.module}`;
    case 'BreakStatement': {
      let code = 'break;';
      if (context.loop_flag) {
        code = `${context.loop_flag} = false;\n` + pad + code;
      }
      return pad + code;
    }
    case 'ContinueStatement':
      return pad + 'continue;';
    case 'PassStatement':
      return pad + ';';
    case 'ListLiteral': {
      const elements = node.elements.map(el => generateJS(el, 0, context)).join(', ');
      return `[${elements}]`;
    }
    default:
      return pad + `/* Unsupported node type: ${node.type} */`;
  }
}
// const tokens = tokenize(testCode);
// const ast = parse(tokens);
// console.log(generateJS(ast));

export default {tokenize, parse, generateJS}