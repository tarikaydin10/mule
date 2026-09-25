import { isSolid, type Level } from './level';
import type { Vector2 } from './movement';

const SQRT2 = Math.SQRT2;

/**
 * Shortest walkable route between two points on the tile grid (A*, eight directions,
 * no cutting across wall corners). Returns the tile centres to walk through, ending at `to`
 * itself; empty when `to` is unreachable or already in the start tile.
 */
export function findPath(level: Level, from: Vector2, to: Vector2): Vector2[] {
  const size = level.tileSize;
  const start = tileIndex(level, from);
  const goal = tileIndex(level, to);
  if (start === null || goal === null || isBlocked(level, goal)) {
    return [];
  }
  if (start === goal) {
    return [];
  }

  const width = level.width;
  const cost = new Map<number, number>([[start, 0]]);
  const cameFrom = new Map<number, number>();
  const open = new MinHeap();
  open.push(start, heuristic(start, goal, width));
  const closed = new Set<number>();

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) {
      break;
    }
    if (closed.has(current)) {
      continue;
    }
    closed.add(current);
    const cx = current % width;
    const cy = Math.floor(current / width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || isSolid(level, cx + dx, cy + dy)) {
          continue;
        }
        // Diagonal steps only when both neighbouring tiles are free, so boxes never clip a corner.
        if (dx !== 0 && dy !== 0 && (isSolid(level, cx + dx, cy) || isSolid(level, cx, cy + dy))) {
          continue;
        }
        const next = (cy + dy) * width + (cx + dx);
        const nextCost = (cost.get(current) ?? 0) + (dx !== 0 && dy !== 0 ? SQRT2 : 1);
        if (nextCost < (cost.get(next) ?? Infinity)) {
          cost.set(next, nextCost);
          cameFrom.set(next, current);
          open.push(next, nextCost + heuristic(next, goal, width));
        }
      }
    }
  }

  if (!cameFrom.has(goal)) {
    return [];
  }
  const path: Vector2[] = [];
  for (let node = goal; node !== start; node = cameFrom.get(node) as number) {
    path.push({ x: (node % width) * size + size / 2, y: Math.floor(node / width) * size + size / 2 });
  }
  path.reverse();
  path[path.length - 1] = { x: to.x, y: to.y };
  return path;
}

function tileIndex(level: Level, point: Vector2): number | null {
  const column = Math.floor(point.x / level.tileSize);
  const row = Math.floor(point.y / level.tileSize);
  if (column < 0 || row < 0 || column >= level.width || row >= level.height) {
    return null;
  }
  return row * level.width + column;
}

function isBlocked(level: Level, index: number): boolean {
  return isSolid(level, index % level.width, Math.floor(index / level.width));
}

/** Octile distance, exact for eight-direction movement without obstacles. */
function heuristic(a: number, b: number, width: number): number {
  const dx = Math.abs((a % width) - (b % width));
  const dy = Math.abs(Math.floor(a / width) - Math.floor(b / width));
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

/** Binary min-heap of node ids by priority. */
class MinHeap {
  private nodes: number[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, priority: number): void {
    this.nodes.push(node);
    this.priorities.push(priority);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.priorities[parent] as number) <= priority) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0] as number;
    const lastNode = this.nodes.pop() as number;
    const lastPriority = this.priorities.pop() as number;
    if (this.nodes.length > 0) {
      this.nodes[0] = lastNode;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.nodes.length && (this.priorities[left] as number) < (this.priorities[smallest] as number)) {
          smallest = left;
        }
        if (right < this.nodes.length && (this.priorities[right] as number) < (this.priorities[smallest] as number)) {
          smallest = right;
        }
        if (smallest === i) {
          break;
        }
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.nodes[a], this.nodes[b]] = [this.nodes[b] as number, this.nodes[a] as number];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b] as number, this.priorities[a] as number];
  }
}
