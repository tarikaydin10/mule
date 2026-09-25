import * as Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  // WebGL is required: the thermal look is a shader filter.
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
  physics: {
    default: 'arcade',
    // Append ?debug to the URL to see physics bodies.
    arcade: { debug: new URLSearchParams(window.location.search).has('debug') },
  },
  scene: [GameScene],
});
