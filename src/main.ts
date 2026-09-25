import * as Phaser from 'phaser';
import { GameScene, type SceneOptions } from './scenes/GameScene';

// ?map=testmap loads another map from public/maps; the default is the first real map.
const options: SceneOptions = { map: new URLSearchParams(window.location.search).get('map') ?? undefined };

const game = new Phaser.Game({
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
  scene: [],
});
game.scene.add('game', GameScene, true, options);
