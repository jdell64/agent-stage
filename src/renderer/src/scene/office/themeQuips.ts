import type { ThemeQuips, ThemeQuipStatus } from '@shared/themePack';

/** Pick from the existing generic pool plus the active theme's additions. */
export function pickQuip(
  genericLines: readonly string[],
  quips: ThemeQuips | undefined,
  status: ThemeQuipStatus,
  character: string,
  previous: string | undefined,
  random: () => number = Math.random,
): string {
  const themed = [
    ...(quips?.byStatus?.[status] ?? []),
    ...(quips?.byCharacter && Object.prototype.hasOwnProperty.call(quips.byCharacter, character.toLowerCase())
      ? quips.byCharacter[character.toLowerCase()] ?? []
      : []),
  ];
  const pool = [...new Set([...genericLines, ...themed])];
  const withoutRepeat = pool.filter((line) => line !== previous);
  const choices = withoutRepeat.length ? withoutRepeat : pool;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] ?? '';
}
