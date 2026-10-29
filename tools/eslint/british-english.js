const spellings = {
  aluminum: "aluminium",
  analog: "analogue",
  analyze: "analyse",
  analyzed: "analysed",
  analyzer: "analyser",
  analyzes: "analyses",
  analyzing: "analysing",
  behavior: "behaviour",
  behaviors: "behaviours",
  canceled: "cancelled",
  canceling: "cancelling",
  catalog: "catalogue",
  catalogs: "catalogues",
  center: "centre",
  centered: "centred",
  centers: "centres",
  color: "colour",
  colored: "coloured",
  colors: "colours",
  customize: "customise",
  customized: "customised",
  defense: "defence",
  favorite: "favourite",
  favorites: "favourites",
  fiber: "fibre",
  flavor: "flavour",
  gray: "grey",
  honor: "honour",
  initialize: "initialise",
  initialized: "initialised",
  labeled: "labelled",
  labeling: "labelling",
  license: "licence",
  maximize: "maximise",
  meter: "metre",
  meters: "metres",
  millimeter: "millimetre",
  millimeters: "millimetres",
  minimize: "minimise",
  modeled: "modelled",
  modeling: "modelling",
  neighbor: "neighbour",
  optimize: "optimise",
  optimized: "optimised",
  organize: "organise",
  organized: "organised",
  recognize: "recognise",
  recognized: "recognised",
  summarize: "summarise",
  traveled: "travelled",
  visualize: "visualise",
  visualization: "visualisation",
};

const pattern = new RegExp(`\\b(${Object.keys(spellings).join("|")})\\b`, "gi");

const matchCase = (source, target) =>
  source === source.toUpperCase()
    ? target.toUpperCase()
    : source[0] === source[0].toUpperCase()
      ? target[0].toUpperCase() + target.slice(1)
      : target;

/**
 * Finds American spellings in a piece of user-facing text.
 * @param {string} text - Text to scan.
 * @returns {{ word: string, british: string, index: number }[]} Each American spelling with its British form.
 */
export const findAmericanSpellings = (text) =>
  [...text.matchAll(pattern)].map((m) => ({
    word: m[0],
    british: matchCase(m[0], spellings[m[0].toLowerCase()]),
    index: m.index,
  }));

const userFacingAttributes = new Set(["alt", "aria-label", "aria-description", "aria-valuetext", "label", "placeholder", "title"]);

const check = (context, node, text) => {
  for (const { word, british } of findAmericanSpellings(text)) {
    context.report({ node, messageId: "american", data: { word, british } });
  }
};

export default {
  meta: {
    type: "problem",
    docs: { description: "Require British English spelling in user-facing text" },
    messages: { american: "Use British English: '{{word}}' should be '{{british}}'." },
    schema: [],
  },
  create: (context) => ({
    Member: (node) => {
      if (node.value.type === "String") check(context, node.value, node.value.value);
    },
    "Element > String": (node) => check(context, node, node.value),
    JSXText: (node) => check(context, node, node.value),
    "JSXAttribute > Literal": (node) => {
      if (userFacingAttributes.has(node.parent.name.name)) check(context, node, String(node.value));
    },
  }),
};
