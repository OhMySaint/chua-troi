import Phaser from 'phaser';
import './style.css';
import { sim } from './core';
import { WorldScene } from './scenes/WorldScene';
import { mountUI } from './ui/ui';
import { mountHome } from './ui/home';
import './audio/Audio';

sim.newWorld();
mountUI();
mountHome();

// The simulation runs on its own timer, not the render loop: browsers stop rendering background
// tabs, but a god who switches tabs must not freeze the world for the other god.
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  sim.update((now - last) / 1000);
  last = now;
}, 30);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#163062',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [WorldScene],
});

if (import.meta.env.DEV) {
  Object.assign(window, { sim, game });
  import('./net/session').then((m) => Object.assign(window, { net: m }));
}
