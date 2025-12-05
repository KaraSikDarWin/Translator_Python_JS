// parser.js
import { tokenizeExpression } from './Tokenizer.js';

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
      keys = ['target', 'value'];
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
    case 'SubscriptExpression':
      keys = ['value', 'slice'];
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
   
    const expr = parseExpression();
    if (peek()[0] === 'OPERATOR' && peek()[1].endsWith('=')) {
      const [opType, opValue] = next();
      const right = parseExpression();
      const validTargets = ['Identifier', 'MemberExpression', 'SubscriptExpression'];
      if (!validTargets.includes(expr.type)) {
        throw new Error('Invalid assignment target');
      }
      if (opValue === '=') {
        return { type: 'Assignment', target: expr, value: right };
      } else {
        return { type: 'AugmentedAssignment', target: expr, operator: opValue.slice(0, -1), value: right };
      }
    } else {
      return { type: 'ExpressionStatement', expression: expr };
    }
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
    while (peek()[0] === 'DELIMITER' && peek()[1] === '[') {
      next();
      const slice = parseExpression();
      expect('DELIMITER', ']');
      expr = { type: 'SubscriptExpression', value: expr, slice };
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
    } else if (type === 'KEYWORD') {
      if (value === 'True') {
        next();
        return { type: 'Literal', value: true, kind: 'boolean' };
      } else if (value === 'False') {
        next();
        return { type: 'Literal', value: false, kind: 'boolean' };
      } else if (value === 'None') {
        next();
        return { type: 'Literal', value: null, kind: 'null' };
      }
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

export { containsBreak, createParser, parse, PRECEDENCE };