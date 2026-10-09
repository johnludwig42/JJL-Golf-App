import postcss from 'postcss';

// CSS color names are values only in color-bearing properties, not font names.
const colorNames = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const colorProperty = /^(?:--|color$|background|border|outline|.*shadow$|fill$|stroke$|.*-color$)/i;

export function findColorLiterals(value, property = 'color') {
  // Ignore ordinary quoted content/comments. Embedded SVG literals are rejected
  // separately instead of silently treating a data URL as a semantic token.
  const masked = value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(/--[\w-]+/g, match => ' '.repeat(match.length));
  const matches = [...masked.matchAll(/#[\da-f]{3,8}\b/gi)]
    .map(match => ({ value: value.slice(match.index, match.index + match[0].length), index: match.index }));
  for (const match of masked.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth && end < masked.length) { if (masked[end] === '(') depth++; if (masked[end] === ')') depth--; end++; }
    const candidate = value.slice(match.index, end);
    if (!/\bvar\(/i.test(candidate)) matches.push({ value: candidate, index: match.index });
  }
  if (colorProperty.test(property)) {
    for (const match of masked.matchAll(/\b[a-z]+\b/gi)) {
      if (colorNames.has(match[0].toLowerCase()) && !matches.some(color => match.index >= color.index && match.index < color.index + color.value.length)) {
        matches.push({ value: match[0], index: match.index });
      }
    }
  }
  if (/data:image\/svg/i.test(value) && /(?:#[\da-f]{3,8}\b|%23[\da-f]{3,8}\b|(?:fill|stroke)\s*=)/i.test(value)) {
    matches.push({ value: 'embedded SVG color', index: 0 });
  }
  return matches.sort((first, second) => first.index - second.index);
}

export function declarationKey(declaration) {
  const context = [];
  for (let parent = declaration.parent; parent && parent.type !== 'root'; parent = parent.parent) {
    context.unshift(parent.type === 'atrule' ? `@${parent.name} ${parent.params}` : parent.selector);
  }
  return `${context.join(' > ')} | ${declaration.prop}: ${declaration.value}${declaration.important ? ' !important' : ''}`.replace(/\r\n/g, '\n');
}

export function isColorTokenDeclaration(declaration) {
  return declaration.parent?.type === 'rule' && declaration.parent.selector === ':root' && /^--color-[a-z\d-]+$/.test(declaration.prop);
}

export function auditStyleContract(css, exceptions = {}) {
  const root = postcss.parse(css);
  const violations = [];
  const usage = new Map();
  const allowed = new Map((exceptions.pxFontSizes || []).map(entry => [entry.key, entry]));
  const colorAllowed = new Map((exceptions.colors || []).map(entry => [entry.key, entry]));
  root.walkDecls(declaration => {
    const key = declarationKey(declaration);
    const location = `${declaration.source.start.line}:${declaration.source.start.column}`;
    if (!isColorTokenDeclaration(declaration) && findColorLiterals(declaration.value, declaration.prop).length) {
      const exception = colorAllowed.get(key);
      if (!exception?.reason) violations.push(`${location} color literal outside semantic token declarations: ${key}`);
      else usage.set(`color:${key}`, (usage.get(`color:${key}`) || 0) + 1);
    }
    if (['font-size','font'].includes(declaration.prop) && /(?:\d*\.)?\d+px\b/i.test(declaration.value)) {
      const exception = allowed.get(key);
      if (!exception?.reason) violations.push(`${location} px font-size without an explicit migration exception: ${key}`);
      else usage.set(`font:${key}`, (usage.get(`font:${key}`) || 0) + 1);
    }
  });
  for (const [kind, entries] of [['font', allowed], ['color', colorAllowed]]) {
    for (const [key, entry] of entries) {
      const count = usage.get(`${kind}:${key}`) || 0;
      if (count !== entry.count) violations.push(`${kind} exception count changed (${count}, allowed ${entry.count}); shrink the exception list when a declaration is migrated: ${key}`);
    }
  }
  return { violations, root };
}

// Used only by regression tests: resolve literal token aliases without changing
// selectors, media conditions, declaration ordering, or cascade specificity.
export function expandColorTokens(css) {
  const root = postcss.parse(css);
  const tokens = new Map();
  root.walkDecls(declaration => { if (isColorTokenDeclaration(declaration)) tokens.set(declaration.prop, declaration.value); });
  const expand = value => value.replace(/var\((--color-[a-z\d-]+)\)/g, (_, key) => {
    if (!tokens.has(key)) throw new Error(`Undefined color token: ${key}`);
    return tokens.get(key);
  });
  root.walkDecls(declaration => { if (!isColorTokenDeclaration(declaration)) declaration.value = expand(declaration.value); });
  root.walkRules(rule => { if (rule.nodes.every(node => node.type === 'comment' || (node.type === 'decl' && isColorTokenDeclaration(node)))) rule.remove(); });
  return root.toString();
}
