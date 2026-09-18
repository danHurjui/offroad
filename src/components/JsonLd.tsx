import { serializeJsonLd } from '@/lib/structuredData'

/**
 * One `<script type="application/ld+json">`.
 *
 * A component rather than the two lines inline at each call site, so the
 * escaping in `serializeJsonLd` cannot be forgotten by whoever adds the
 * next one — that is the whole reason it exists.
 */
export default function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
