import { findVariable, getStringIfConstant } from "@eslint-community/eslint-utils";

const globalPrefixes = new Set(["window", "globalThis", "document", "self"]);
const absoluteUrl = /^(?:[a-z][\d+.a-z-]*:|\/\/)/i;

function hasProperty(node, name) {
  return node.type === "MemberExpression" && (node.computed
    ? node.property.type === "Literal" && node.property.value === name
    : node.property.type === "Identifier" && node.property.name === name);
}

function locationRoot(node) {
  if (node.type === "Identifier" && node.name === "location") return node;
  if (hasProperty(node, "location") && node.object.type === "Identifier" && globalPrefixes.has(node.object.name)) {
    return node.object;
  }
  return null;
}

function stringPrefix(node, sourceCode, seen = new Set()) {
  // Destination aliases may refer back to themselves or each other. A cycle
  // provides no known prefix, rather than terminating the entire lint run.
  if (seen.has(node)) return null;
  seen.add(node);

  const scope = sourceCode.getScope(node);
  const constant = getStringIfConstant(node, scope);
  if (constant !== null) return constant;
  if (node.type === "TemplateLiteral") {
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    return stringPrefix(node.left, sourceCode, seen);
  }
  if (node.type !== "Identifier") return null;

  const variable = findVariable(scope, node);
  const definition = variable?.defs.at(-1);
  if (definition?.type !== "Variable") return null;

  let destination = definition.node.init;
  // Preserve the preceding-write behavior for let/var destinations as well
  // as constants. Writes after this navigation cannot determine its prefix.
  for (const reference of variable.references) {
    if (reference.identifier.range[0] >= node.range[0]) break;
    if (reference.isWrite() && reference.writeExpr) destination = reference.writeExpr;
  }
  return destination ? stringPrefix(destination, sourceCode, seen) : null;
}

const noLocationAssignRelativeDestination = {
  meta: {
    type: "problem",
    docs: {
      description: "Use framework navigation instead of location.assign or location.href for internal pages.",
      url: "https://nextjs.org/docs/messages/no-location-assign-relative-destination",
    },
    schema: [],
    messages: {
      internalNavigation: "Do not use {{expression}} to navigate to internal pages. Use redirect() during rendering or useRouter().push() in a Client Component event handler.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function check(node, member, destination, expression) {
      const root = locationRoot(member.object);
      if (!root) return;
      const variable = findVariable(sourceCode.getScope(root), root);
      if (!variable || variable.scope.type !== "global" || variable.defs.length !== 0) return;
      const prefix = stringPrefix(destination, sourceCode);
      if (prefix !== null && !absoluteUrl.test(prefix)) {
        context.report({ node, messageId: "internalNavigation", data: { expression } });
      }
    }

    return {
      CallExpression(node) {
        if (!hasProperty(node.callee, "assign")) return;
        const destination = node.arguments[0];
        if (!destination || destination.type === "SpreadElement") return;
        check(node, node.callee, destination, `${sourceCode.getText(node.callee)}()`);
      },
      AssignmentExpression(node) {
        if (!hasProperty(node.left, "href")) return;
        check(node, node.left, node.right, sourceCode.getText(node.left));
      },
    };
  },
};

export default noLocationAssignRelativeDestination;
