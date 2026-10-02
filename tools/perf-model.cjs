'use strict';

function pct(oldValue, newValue) {
  return ((1 - newValue / oldValue) * 100).toFixed(2);
}

const articleCount = 300;
const mutationWaves = 1200;
const baselineArticleInspections = articleCount * mutationWaves;
const targetedArticleInspections = articleCount + mutationWaves;

const galleryItems = 2000;
const firstPaintCards = 72;

const oldSelectorPassesPerRoot = 7;
const newSelectorPassesPerRoot = 1;

const report = {
  model: 'MediaForge GX 0.3 hot-path workload model',
  assumptions: {
    xArticles: articleCount,
    mutationWaves,
    galleryItems,
    firstPaintCards
  },
  xMutationDecorating: {
    baselineArticleInspections,
    v03ArticleInspections: targetedArticleInspections,
    reductionPercent: Number(pct(baselineArticleInspections, targetedArticleInspections))
  },
  sidePanelInitialDom: {
    baselineCardsConstructed: galleryItems,
    v03CardsConstructed: firstPaintCards,
    reductionPercent: Number(pct(galleryItems, firstPaintCards))
  },
  deepDomCollection: {
    baselineSelectorPassesPerRoot: oldSelectorPassesPerRoot,
    v03SelectorPassesPerRoot: newSelectorPassesPerRoot,
    reductionPercent: Number(pct(oldSelectorPassesPerRoot, newSelectorPassesPerRoot))
  }
};

console.log(JSON.stringify(report, null, 2));
