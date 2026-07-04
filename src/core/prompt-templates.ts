import type { Intent } from "./matrix";
import type { CategoryArchetype } from "./semantic";

export interface PromptTemplateSeed {
  archetype: CategoryArchetype;
  intent: Intent;
  variantKey: string;
  text: string;
}

// Three variant phrasings per intent and archetype (PRD 8.4, AT-2).
// The b2b pack preserves the original PRD text; consumer packs remove
// procurement-language jargon that invalidates consumer-category audits.
export const TEMPLATE_SEED: PromptTemplateSeed[] = [
  { archetype: "b2b", intent: "discovery", variantKey: "v1", text: "What tools should a {persona} in {market} consider for {job_to_be_done}?" },
  { archetype: "b2b", intent: "discovery", variantKey: "v2", text: "Which solutions would you shortlist for a {persona} in {market} trying to {job_to_be_done}?" },
  { archetype: "b2b", intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What should I look at for {job_to_be_done}?" },
  { archetype: "b2b", intent: "consideration", variantKey: "v1", text: "What are the best options for {persona} teams evaluating {category} in {market}?" },
  { archetype: "b2b", intent: "consideration", variantKey: "v2", text: "Rank the leading {category} options for a {persona} buyer in {market}." },
  { archetype: "b2b", intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} vendors are worth a demo?" },
  { archetype: "b2b", intent: "comparison", variantKey: "v1", text: "Compare {client_brand} against {competitor_list} for a {persona} buyer in {market}." },
  { archetype: "b2b", intent: "comparison", variantKey: "v2", text: "How does {client_brand} stack up against {competitor_list} for {persona} teams in {market}?" },
  { archetype: "b2b", intent: "comparison", variantKey: "v3", text: "Between {client_brand} and {competitor_list}, which fits a {persona} in {market} best, and why?" },
  { archetype: "b2b", intent: "validation", variantKey: "v1", text: "Is {client_brand} a good fit for {persona} teams that care about {attribute_list}?" },
  { archetype: "b2b", intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to a {persona} prioritizing {attribute_list}?" },
  { archetype: "b2b", intent: "validation", variantKey: "v3", text: "For a {persona} that values {attribute_list}, what are {client_brand}'s strengths and weaknesses?" },
  { archetype: "b2b", intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { archetype: "b2b", intent: "objection", variantKey: "v2", text: "What are the most common criticisms of {client_brand} from {persona} buyers?" },
  { archetype: "b2b", intent: "objection", variantKey: "v3", text: "Why might a {persona} decide against {client_brand}?" },

  { archetype: "consumer_product", intent: "discovery", variantKey: "v1", text: "What {category} options should a {persona} in {market} consider for {job_to_be_done}?" },
  { archetype: "consumer_product", intent: "discovery", variantKey: "v2", text: "Which {category} products are worth trying for a {persona} in {market} who wants to {job_to_be_done}?" },
  { archetype: "consumer_product", intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What should I buy or try for {job_to_be_done}?" },
  { archetype: "consumer_product", intent: "consideration", variantKey: "v1", text: "What are the best {category} choices for a {persona} in {market}?" },
  { archetype: "consumer_product", intent: "consideration", variantKey: "v2", text: "Rank the leading {category} options for someone like a {persona} in {market}." },
  { archetype: "consumer_product", intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} products would you seriously consider?" },
  { archetype: "consumer_product", intent: "comparison", variantKey: "v1", text: "Compare {client_brand} against {competitor_list} for a {persona} in {market}." },
  { archetype: "consumer_product", intent: "comparison", variantKey: "v2", text: "How does {client_brand} compare with {competitor_list} for someone who cares about {attribute_list}?" },
  { archetype: "consumer_product", intent: "comparison", variantKey: "v3", text: "Between {client_brand} and {competitor_list}, which would you pick for a {persona} in {market}, and why?" },
  { archetype: "consumer_product", intent: "validation", variantKey: "v1", text: "Is {client_brand} a good choice for a {persona} who cares about {attribute_list}?" },
  { archetype: "consumer_product", intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to someone prioritizing {attribute_list}?" },
  { archetype: "consumer_product", intent: "validation", variantKey: "v3", text: "For a {persona}, what are {client_brand}'s strengths and weaknesses around {attribute_list}?" },
  { archetype: "consumer_product", intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { archetype: "consumer_product", intent: "objection", variantKey: "v2", text: "What do people most often criticize about {client_brand}?" },
  { archetype: "consumer_product", intent: "objection", variantKey: "v3", text: "Why might a {persona} decide not to choose {client_brand}?" },

  { archetype: "consumer_venue", intent: "discovery", variantKey: "v1", text: "Where should a {persona} in {market} go for {job_to_be_done}?" },
  { archetype: "consumer_venue", intent: "discovery", variantKey: "v2", text: "What {category} places should a {persona} in {market} consider?" },
  { archetype: "consumer_venue", intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What places should I check out for {job_to_be_done}?" },
  { archetype: "consumer_venue", intent: "consideration", variantKey: "v1", text: "What are the best {category} places for a {persona} in {market}?" },
  { archetype: "consumer_venue", intent: "consideration", variantKey: "v2", text: "Rank the leading {category} spots for someone like a {persona} in {market}." },
  { archetype: "consumer_venue", intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} places would you seriously consider visiting?" },
  { archetype: "consumer_venue", intent: "comparison", variantKey: "v1", text: "Compare {client_brand} against {competitor_list} for a {persona} in {market}." },
  { archetype: "consumer_venue", intent: "comparison", variantKey: "v2", text: "How does {client_brand} compare with {competitor_list} for someone who cares about {attribute_list}?" },
  { archetype: "consumer_venue", intent: "comparison", variantKey: "v3", text: "Between {client_brand} and {competitor_list}, where should a {persona} in {market} go, and why?" },
  { archetype: "consumer_venue", intent: "validation", variantKey: "v1", text: "Is {client_brand} a good place for a {persona} who cares about {attribute_list}?" },
  { archetype: "consumer_venue", intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to someone looking for {attribute_list}?" },
  { archetype: "consumer_venue", intent: "validation", variantKey: "v3", text: "For a {persona}, what are {client_brand}'s strengths and weaknesses around {attribute_list}?" },
  { archetype: "consumer_venue", intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { archetype: "consumer_venue", intent: "objection", variantKey: "v2", text: "What do visitors most often criticize about {client_brand}?" },
  { archetype: "consumer_venue", intent: "objection", variantKey: "v3", text: "Why might a {persona} decide not to go to {client_brand}?" },
];
