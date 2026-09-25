import * as Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  // WebGL is required: the thermal vision gadget is a shader filter.
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#000000',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  scene: [GameScene],
});
