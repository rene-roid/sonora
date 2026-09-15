/**
 * The three background looks, one per kind of thing that has no artwork of its own.
 *
 * Moods get a single cover duotoned to the mood's colour, genres a tinted four-cover mosaic and
 * mixes a fanned deck over a blur of itself, so a glance at Home's shelf says which is which
 * before the label is read. Which covers each one wears is `tagArt`'s business, not this file's.
 */
import { useState } from 'react'
import { MicVocal, Smile, Sparkles } from 'lucide-react'
import type { MixKind } from '@shared/types'
import { localArtUrl } from '@shared/art'
import { ART_COUNT, useTagArt, type ArtRef } from '../tagArt'
import { gradient, hue } from './AlbumCard'

/** A cover out of the local art cache. Renders nothing at all if it is not there and cannot be got. */
function ArtImage({ id, className = '' }: { id: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={localArtUrl(id)}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}

/** Repeat what there is until every slot has a cover, so a tag with one album still fills its grid. */
function fill(ids: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => ids[i % ids.length])
}

/** One cover, full bleed, pulled towards the mood's own colour and scrimmed for the label. */
function MoodArt({ name, ids }: { name: string; ids: string[] }) {
  return (
    <>
      <ArtImage id={ids[0]} className="scale-105 saturate-125" />
      {/* `color` keeps the photograph's light and shade and swaps only its hue, which is a duotone. */}
      <div
        className="absolute inset-0 opacity-55 mix-blend-color"
        style={{ background: `hsl(${hue(name)} 70% 45%)` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
    </>
  )
}

/**
 * Four covers as a mosaic under a two-tone diagonal wash. Where a mood is one flat colour over one
 * picture, a genre is a colour that travels across four, which is what keeps the two styles apart
 * at tile size. The wash goes on twice: soft-light for the light and shade, colour for the hue.
 */
function GenreArt({ name, ids }: { name: string; ids: string[] }) {
  const h = hue(name)
  const wash = `linear-gradient(135deg, hsl(${h} 90% 62%), hsl(${(h + 50) % 360} 85% 38%))`
  return (
    <>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px brightness-90">
        {fill(ids, ART_COUNT.genre).map((id, i) => (
          <div key={`${id}:${i}`} className="overflow-hidden">
            <ArtImage id={id} />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 opacity-90 mix-blend-soft-light" style={{ background: wash }} />
      <div className="absolute inset-0 opacity-45 mix-blend-color" style={{ background: wash }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_36%,rgba(255,255,255,0.16)_50%,transparent_64%)]" />
    </>
  )
}

/** What a mix was seeded from, marked in the corner of its deck. */
const MIX_ICONS: Record<MixKind, typeof Sparkles> = { genre: Sparkles, mood: Smile, artist: MicVocal }

/** Where each card of the deck sits, in percent of the deck's width and in degrees. Front first. */
const FAN = [
  { shift: 0, rotate: 0 },
  { shift: -32, rotate: -14 },
  { shift: 32, rotate: 14 }
]

/** A fanned deck of covers floating over a blown-up blur of the first one. */
function MixArt({ name, ids, kind }: { name: string; ids: string[]; kind: MixKind }) {
  const deck = ids.slice(0, ART_COUNT.mix)
  const Icon = MIX_ICONS[kind]
  return (
    <>
      <ArtImage id={ids[0]} className="scale-150 blur-xl saturate-150" />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(160deg, hsl(${hue(name)} 75% 32% / 0.5), rgba(0,0,0,0.78))` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative aspect-square h-[58%]">
          {deck.map((id, i) => (
            <div
              key={`${id}:${i}`}
              className="absolute inset-0 overflow-hidden rounded-[14%] shadow-lg ring-1 ring-white/25"
              style={{
                transform: `translateX(${FAN[i].shift}%) rotate(${FAN[i].rotate}deg)`,
                zIndex: deck.length - i
              }}
            >
              <ArtImage id={id} />
            </div>
          ))}
        </div>
      </div>
      <Icon className="absolute top-[7%] right-[7%] h-[15%] w-[15%] text-white/80 drop-shadow" />
    </>
  )
}

/**
 * Fills whatever box it is put in. `name` is the label shown over it, and seeds the colour the
 * style tints with, so the card keeps its identity while the covers underneath turn over.
 */
export function TagArt({ art, name }: { art: ArtRef; name: string }) {
  const ids = useTagArt(art)
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: gradient(name) }}>
      {ids.length > 0 &&
        (art.style === 'mood' ? (
          <MoodArt name={name} ids={ids} />
        ) : art.style === 'genre' ? (
          <GenreArt name={name} ids={ids} />
        ) : (
          <MixArt name={name} ids={ids} kind={art.seed.kind} />
        ))}
    </div>
  )
}
