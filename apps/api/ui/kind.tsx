/** 名前だけでは区分（款・項・目・節・事業）が分からないので、名前の前に添える */
export function Kind({ kind }: { kind: string }) {
  return <span className="kind">{kind}</span>
}
