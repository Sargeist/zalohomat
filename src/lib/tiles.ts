const TILE = 256;

function project(lat: number, lng: number, zoom: number) {
  const scale = TILE * Math.pow(2, zoom);
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = scale * (0.5 + lng / 360);
  const y = scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
  return { x, y };
}

export interface ThumbTile {
  url: string;
  left: number;
  top: number;
}

export interface Thumb {
  tiles: ThumbTile[];
  offsetX: number;
  offsetY: number;
  size: number;
}

export function mapThumb(lat: number, lng: number, zoom = 17, grid = 2): Thumb {
  const { x, y } = project(lat, lng, zoom);
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  const half = Math.floor(grid / 2);

  const tiles: ThumbTile[] = [];
  for (let dy = -half; dy < grid - half; dy++) {
    for (let dx = -half; dx < grid - half; dx++) {
      const sub = 'abcd'[Math.abs((tx + dx + ty + dy) % 4)];
      tiles.push({
        url: `https://${sub}.basemaps.cartocdn.com/dark_nolabels/${zoom}/${tx + dx}/${ty + dy}.png`,
        left: (dx + half) * TILE,
        top: (dy + half) * TILE,
      });
    }
  }

  return {
    tiles,
    offsetX: x - tx * TILE + half * TILE,
    offsetY: y - ty * TILE + half * TILE,
    size: grid * TILE,
  };
}
