import { parseAndWalk } from "oxc-walker";

const nodes = [];
parseAndWalk('console.log("hello world")', "test.js", {
  enter(node) {
    nodes.push(node);
  },
});

// eslint-disable-next-line no-console
console.log(nodes);
