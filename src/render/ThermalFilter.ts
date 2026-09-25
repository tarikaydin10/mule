import * as Phaser from 'phaser';
import type { ThermalPolarity } from '../systems/thermal';
import fragmentShader from './thermal.frag?raw';

const NODE_NAME = 'FilterThermal';

/** Camera filter that renders the scene's temperature grey levels as a thermal image. */
export class ThermalFilter extends Phaser.Filters.Controller {
  polarity: ThermalPolarity = 'white-hot';
  /** Strength of the per-frame sensor noise, in grey levels (0 to 1). */
  noiseAmount = 0.07;
  /** How strongly hot pixels glow into their surroundings. */
  bloomStrength = 1.4;
  /** Seconds, advanced by the scene so the noise moves. */
  time = 0;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, NODE_NAME);
  }
}

class ThermalFilterNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(NODE_NAME, manager, undefined, fragmentShader);
  }

  override setupUniforms(controller: ThermalFilter, drawingContext: Phaser.Renderer.WebGL.DrawingContext): void {
    const programs = this.programManager;
    programs.setUniform('resolution', [drawingContext.width, drawingContext.height]);
    programs.setUniform('time', controller.time);
    programs.setUniform('blackHot', controller.polarity === 'black-hot' ? 1 : 0);
    programs.setUniform('noiseAmount', controller.noiseAmount);
    programs.setUniform('bloomStrength', controller.bloomStrength);
  }
}

/** Adds the thermal filter to a camera; registers its render node on first use. */
export function addThermalFilter(camera: Phaser.Cameras.Scene2D.Camera): ThermalFilter {
  const renderer = camera.scene.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
    throw new Error('The thermal filter needs WebGL');
  }
  if (!renderer.renderNodes.hasNode(NODE_NAME)) {
    renderer.renderNodes.addNodeConstructor(NODE_NAME, ThermalFilterNode);
  }
  const filter = new ThermalFilter(camera);
  camera.filters.internal.add(filter);
  return filter;
}
