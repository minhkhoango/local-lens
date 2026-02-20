import TurndownService from 'turndown';

const indexOf = Array.prototype.indexOf;
const every = Array.prototype.every;
const rules: Record<string, TurndownService.Rule> = {};

rules.tableCell = {
  filter: ['th', 'td'],
  replacement: function (content, node) {
    return cell(content, node as HTMLElement);
  },
};

rules.tableRow = {
  filter: 'tr',
  replacement: function (content, node) {
    let borderCells = '';
    const alignMap: Record<string, string> = {
      left: ':--',
      right: '--:',
      center: ':-:',
    };

    if (isHeadingRow(node as HTMLTableRowElement)) {
      for (let i = 0; i < node.childNodes.length; i++) {
        let border = '---';
        const childNode = node.childNodes[i] as HTMLElement;
        const align = (
          (childNode.getAttribute && childNode.getAttribute('align')) ||
          ''
        ).toLowerCase();

        if (align) border = alignMap[align] || border;

        borderCells += cell(border, childNode);
      }
    }
    return '\n' + content + (borderCells ? '\n' + borderCells : '');
  },
};

rules.table = {
  // Only convert tables with a heading row.
  filter: function (node) {
    return (
      node.nodeName === 'TABLE' &&
      isHeadingRow((node as HTMLTableElement).rows[0])
    );
  },

  replacement: function (content) {
    // Ensure there are no blank lines
    content = content.replace('\n\n', '\n');
    return '\n\n' + content + '\n\n';
  },
};

rules.tableSection = {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: function (content) {
    return content;
  },
};

// A tr is a heading row if:
// - the parent is a THEAD
// - or if its the first child of the TABLE or the first TBODY (possibly
//   following a blank THEAD)
// - and every cell is a TH
function isHeadingRow(tr: HTMLTableRowElement | null): boolean {
  if (!tr) return false;
  const parentNode = tr.parentNode;
  if (!parentNode) return false;
  return (
    parentNode.nodeName === 'THEAD' ||
    (parentNode.firstChild === tr &&
      (parentNode.nodeName === 'TABLE' ||
        isFirstTbody(parentNode as HTMLElement)) &&
      every.call(tr.childNodes, function (n: Node) {
        return n.nodeName === 'TH';
      }))
  );
}

function isFirstTbody(element: HTMLElement): boolean {
  const previousSibling = element.previousSibling;
  return (
    element.nodeName === 'TBODY' &&
    (!previousSibling ||
      (previousSibling.nodeName === 'THEAD' &&
        /^\s*$/i.test(previousSibling.textContent || '')))
  );
}

function cell(content: string, node: HTMLElement): string {
  const index = indexOf.call(node.parentNode?.childNodes || [], node);
  let prefix = ' ';
  if (index === 0) prefix = '| ';
  return prefix + content + ' |';
}

export function tables(turndownService: TurndownService) {
  turndownService.keep(function (node) {
    return (
      node.nodeName === 'TABLE' &&
      !isHeadingRow((node as HTMLTableElement).rows[0])
    );
  });
  for (const key in rules) turndownService.addRule(key, rules[key]);
}
