// generator.js
import { containsBreak } from './Parser';

let loop_flag_id = 0;

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
    case 'SubscriptExpression': {
      return `${generateJS(node.value, 0, context)}[${generateJS(node.slice, 0, context)}]`;
    }
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

export { generateJS };