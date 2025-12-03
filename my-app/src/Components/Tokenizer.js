// tokenizer.js
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

export { patterns, tokenize, tokenizeExpression };