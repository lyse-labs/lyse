export interface KappaPair {
  dimensionId: string;
  staticVerdict: boolean;
  llmVerdict: boolean;
}

// high-agreement: 9/10 pairs agree, 1 disagrees
// N=10, agree=9, Po=0.9
// static_pos=6/10=0.6, llm_pos=5/10=0.5
// Pe = 0.6*0.5 + 0.4*0.5 = 0.30 + 0.20 = 0.50
// kappa = (0.9 - 0.5) / (1 - 0.5) = 0.4 / 0.5 = 0.8 (exact)

// low-agreement: symmetric disagreement → kappa = 0.0
// N=4, agree=2, Po=0.5
// static_pos=2/4=0.5, llm_pos=2/4=0.5
// Pe = 0.5*0.5 + 0.5*0.5 = 0.5
// kappa = (0.5 - 0.5) / (1 - 0.5) = 0.0 (exact)

// medium-agreement: kappa = 0.4 (3-pair hand-computed case)
// N=4, agree=3, Po=3/4=0.75
// static_pos=2/4=0.5, llm_pos=3/4=0.75
// Pe = 0.5*0.75 + 0.5*0.25 = 0.375+0.125 = 0.5
// kappa = (0.75 - 0.5) / (1 - 0.5) = 0.25/0.5 = 0.5

export const KAPPA_FIXTURES: KappaPair[] = [
  // high-agreement dimension — kappa = 0.8 (exact)
  { dimensionId: "high-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "high-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "high-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "high-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "high-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "high-agreement", staticVerdict: false, llmVerdict: false },
  { dimensionId: "high-agreement", staticVerdict: false, llmVerdict: false },
  { dimensionId: "high-agreement", staticVerdict: false, llmVerdict: false },
  { dimensionId: "high-agreement", staticVerdict: false, llmVerdict: false },
  { dimensionId: "high-agreement", staticVerdict: true,  llmVerdict: false },

  // low-agreement dimension — kappa = 0.0 (exact)
  { dimensionId: "low-agreement",  staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "low-agreement",  staticVerdict: false, llmVerdict: false },
  { dimensionId: "low-agreement",  staticVerdict: true,  llmVerdict: false },
  { dimensionId: "low-agreement",  staticVerdict: false, llmVerdict: true  },

  // medium-agreement dimension — kappa = 0.5 (exact)
  { dimensionId: "medium-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "medium-agreement", staticVerdict: true,  llmVerdict: true  },
  { dimensionId: "medium-agreement", staticVerdict: false, llmVerdict: false },
  { dimensionId: "medium-agreement", staticVerdict: true,  llmVerdict: false },
];
