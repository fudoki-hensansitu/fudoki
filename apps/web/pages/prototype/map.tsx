import { TownMap } from '../../prototype/map'
import type { Props } from './map.server'

export default function MapPage(props: Props) {
  return <TownMap {...props} />
}
