/**
 * Appels à Claude (clé ANTHROPIC_API_KEY côté serveur) :
 *  - lecture d'une capture d'écran d'effectif MPG → liste de joueurs ;
 *  - chat « pourquoi lui ? » qui explique la compo à partir des chiffres du moteur.
 *
 * Les refus éventuels du modèle sont rattrapés côté serveur par un modèle de
 * repli (paramètre `fallbacks: "default"`).
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

function textOf(response: Anthropic.Beta.BetaMessage): string {
  return response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export interface ScreenshotPlayer {
  name: string;
  position?: "G" | "D" | "M" | "A";
  club?: string;
}

/** Lit les joueurs visibles sur une capture d'effectif (MPG ou autre appli). */
export async function readSquadScreenshot(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp"
): Promise<ScreenshotPlayer[]> {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["players"],
          properties: {
            players: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  position: { type: "string", enum: ["G", "D", "M", "A"] },
                  club: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text:
              "Cette image montre l'effectif d'une équipe de fantasy football (Mon Petit Gazon ou une appli similaire). " +
              "Liste chaque joueur de football visible, avec son nom tel qu'écrit, son poste si visible (G gardien, D défenseur, M milieu, A attaquant) " +
              "et son club si visible. Ignore les entraîneurs, les menus et les joueurs fictifs. Si aucun effectif n'est visible, renvoie une liste vide.",
          },
        ],
      },
    ],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);

  if (response.stop_reason === "refusal") return [];
  try {
    const parsed = JSON.parse(textOf(response)) as { players?: ScreenshotPlayer[] };
    return (parsed.players ?? []).filter((p) => p.name?.trim()).slice(0, 40);
  } catch {
    return [];
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const CHAT_SYSTEM = `Tu es l'assistant de l'app « Le 11 parfait », qui aide à composer son équipe sur Mon Petit Gazon (MPG).
On te donne, en données, la compo calculée par le moteur de l'app pour la prochaine journée : pour chaque joueur, sa probabilité d'être titulaire, sa note MPG attendue, ses buts attendus, son adversaire et les facteurs qui expliquent sa note.
Réponds en français, en quelques phrases courtes et concrètes, en t'appuyant sur ces chiffres. Cite les chiffres utiles (pourcentages, notes attendues).
Quand on te demande de choisir entre deux joueurs, compare leurs chiffres et tranche clairement, en disant ce qui pourrait faire changer d'avis.
Si une information n'est pas dans les données (une blessure annoncée après le calcul, une rumeur), dis que tu ne la connais pas plutôt que d'inventer.
Les règles MPG utiles : un titulaire qui ne joue pas est remplacé par le premier remplaçant de son poste qui a joué ; un remplaçant d'une autre ligne perd 1 point par ligne d'écart ; sans remplaçant, « Rotaldo » entre avec 2,5.`;

/** Réponse du chat, à partir du contexte de la compo (JSON compact). */
export async function askCoach(context: string, history: ChatTurn[]): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Données de la compo (JSON) :\n${context}` },
    { role: "assistant", content: "Bien reçu, je m'appuie sur ces chiffres." },
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content })),
  ];
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "low" },
    messages,
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);
  if (response.stop_reason === "refusal") {
    return "Je ne peux pas répondre à cette question. Pose-moi plutôt une question sur ta compo.";
  }
  return textOf(response) || "Je n'ai pas de réponse à proposer.";
}

export { Anthropic };
