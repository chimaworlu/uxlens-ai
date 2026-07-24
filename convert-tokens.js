const fs = require('fs');

// Read the design tokens file
const rawData = fs.readFileSync('design-tokens.tokens.json', 'utf8');
const designTokens = JSON.parse(rawData);

// Utility to convert a path array to a CSS variable name
function toCssVarName(pathArray) {
    return '--' + pathArray.map(p => p.replace(/\s+/g, '-').toLowerCase()).join('-');
}

// Utility to convert reference values like {primitives.color.x} to var(--primitives-color-x)
function resolveValue(value) {
    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
        const refPath = value.slice(1, -1).split('.');
        return `var(${toCssVarName(refPath)})`;
    }
    return value;
}

// Check if a node is a token (has a 'value' property and optionally 'type')
function isToken(node) {
    return node !== null && typeof node === 'object' && 'value' in node;
}

const groups = {};

// Recursively traverse the tokens object
function traverse(node, path = []) {
    if (isToken(node)) {
        let value = node.value;
        
        // Handle complex token values like typography or shadows
        if (typeof value === 'object') {
            if (node.type === 'typography') {
                // Combine typography properties into a shorthand or multiple vars
                // For simplicity, we output them as separate variables
                for (const [key, val] of Object.entries(value)) {
                    addToken([...path, key], resolveValue(val));
                }
                return;
            } else if (node.type === 'custom-shadow') {
                // e.g. { shadowType: 'dropShadow', color: '#...', offsetX: 2, offsetY: 2, radius: 4, spread: 0 }
                const shadowVal = `${value.offsetX}px ${value.offsetY}px ${value.radius}px ${value.spread}px ${resolveValue(value.color)}`;
                addToken(path, shadowVal);
                return;
            }
        }
        
        addToken(path, resolveValue(value));
    } else if (typeof node === 'object') {
        for (const [key, childNode] of Object.entries(node)) {
            traverse(childNode, [...path, key]);
        }
    }
}

function addToken(path, value) {
    const topLevelGroup = path[0];
    if (!groups[topLevelGroup]) {
        groups[topLevelGroup] = [];
    }
    groups[topLevelGroup].push(`  ${toCssVarName(path)}: ${value};`);
}

traverse(designTokens);

// Generate the CSS content
let cssContent = ':root {\n';

// Write primitives first since they are the foundations
if (groups['primitives']) {
    cssContent += '\n  /* ==========================================\n';
    cssContent += '     PRIMITIVE COLORS (FOUNDATIONS)\n';
    cssContent += '     NOTE: These are foundations and should NOT be applied directly on the UI.\n';
    cssContent += '     ========================================== */\n';
    cssContent += groups['primitives'].join('\n') + '\n';
}

// Write color roles next
if (groups['color roles']) {
    cssContent += '\n  /* ==========================================\n';
    cssContent += '     COLOR ROLES\n';
    cssContent += '     NOTE: Use these color variables directly on the UI components.\n';
    cssContent += '     ========================================== */\n';
    cssContent += groups['color roles'].join('\n') + '\n';
}

// Write the rest of the groups
for (const [groupName, tokens] of Object.entries(groups)) {
    if (groupName !== 'primitives' && groupName !== 'color roles') {
        cssContent += `\n  /* --- ${groupName.toUpperCase()} --- */\n`;
        cssContent += tokens.join('\n') + '\n';
    }
}

cssContent += '}\n';

// Write to CSS file
fs.writeFileSync('design-tokens.css', cssContent, 'utf8');
console.log('Successfully generated design-tokens.css');
console.log('Take note: Primitive colors are mapped to CSS variables for foundational reference, but color roles should be used for UI.');
