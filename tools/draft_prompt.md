# Drafting prompt for a new dish

Paste this into Claude (or any LLM), fill in the dish, and save the JSON it returns as
`dishes/<id>.json`. Then verify every chemistry claim yourself before changing
`review.status` to `"verified"`.

---

You are helping write a page for মিশ্রণ, a Bengali cookbook that explains the chemistry
behind each step of home cooking. Write the recipe for **<DISH NAME>** as a single JSON
object that follows the schema below. Return only the JSON, with no commentary and no
code fences.

Rules:
- Write `action_bn` and `maa_says` in natural, colloquial Bengali, the way a mother
  would say it in a Kolkata kitchen. `maa_says` is a short piece of traditional kitchen
  wisdom for that step, not an instruction repeated.
- `chemistry.explanation` should be 3–5 plain sentences for a curious non-scientist.
  Name the actual molecules and processes. Don't overstate health claims.
- Only include a molecule if you are confident its SMILES string is correct. For
  proteins and other large molecules, omit `smiles` and explain in `note`.
- Add an `energy_diagram` only where a reaction genuinely has a barrier worth showing.
  Energies are relative values between 0 and 1.
- For `golpo`, use real history, a proverb, or literature. Never invent quotes. Only
  quote authors who are out of copyright (e.g. Tagore, Sukumar Ray); paraphrase others.
- Set `review.status` to `"draft"` and use `review.notes` to list the claims you are
  least sure about.

Schema: see `schema/dish.schema.json`. Example: see `dishes/beguni.json`.
Section must be one of: `pater-shuru`, `mukhorochok`, `kobji-dubiye`, `shesh-paate`.
