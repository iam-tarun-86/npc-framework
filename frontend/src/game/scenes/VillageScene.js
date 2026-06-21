import Phaser from 'phaser';
import Player from '../entities/Player';
import NPC from '../entities/NPC';
import { TILE_MAP, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, NPC_POSITIONS, PLAYER_SPAWN } from '../data/villageMap';

export default class VillageScene extends Phaser.Scene {
  constructor() {
    super({ key: 'VillageScene' });
  }

  preload() {
    this.load.spritesheet('characters', 'assets/roguelike-characters/roguelikeChar_transparent.png', {
      frameWidth: 16,
      frameHeight: 16,
      margin: 1,
      spacing: 1
    });
  }

  create() {
    this.createMap();

    this.player = new Player(this, PLAYER_SPAWN.x * TILE_SIZE, PLAYER_SPAWN.y * TILE_SIZE);

    this.npcs = {};
    Object.entries(NPC_POSITIONS).forEach(([key, data]) => {
      this.npcs[key] = new NPC(this, {
        ...data,
        id: key,
        frame: this.getNPCFrame(key),
        x: data.x * TILE_SIZE,
        y: data.y * TILE_SIZE
      });
    });

    this.physics.world.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    this.cameras.main.setZoom(1.5);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.dialogueOpen = false;
    window.addEventListener('dialogue-open', () => {
      this.dialogueOpen = true;
      this.input.keyboard.enabled = false;
    });
    window.addEventListener('dialogue-close', () => {
      this.dialogueOpen = false;
      this.input.keyboard.enabled = true;
    });

    // Dev toggle with T key
    this.input.keyboard.on('keydown-T', () => {
      if (!this.dialogueOpen) {
        window.dispatchEvent(new CustomEvent('toggle-dev'));
      }
    });
  }

  createMap() {
    const graphics = this.add.graphics();

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileType = TILE_MAP[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        const colors = {
          0: 0x4a7c4e,
          1: 0x2d5a27,
          2: 0x8B4513,
          3: 0xC4A484,
        };

        graphics.fillStyle(colors[tileType] || 0x4a7c4e, 1);
        graphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        if (tileType === 1) {
          graphics.fillStyle(0x5C4033, 1);
          graphics.fillRect(px + 6, py + 8, 4, 8);
        } else if (tileType === 2) {
          graphics.fillStyle(0x654321, 1);
          graphics.fillTriangle(px, py + 8, px + 8, py, px + 16, py + 8);
        }
      }
    }
  }

  getNPCFrame(key) {
    const frames = { alaric: 15, borin: 23, vexis: 31, mira: 45 };
    return frames[key] || 0;
  }

  update() {
    if (this.dialogueOpen) return;

    this.player.update();

    let nearNPC = null;
    Object.entries(this.npcs).forEach(([key, npc]) => {
      const canTalk = npc.canInteract(this.player);
      if (canTalk) nearNPC = npc;
    });

    // Dispatch game-state for React HUD
    window.dispatchEvent(new CustomEvent('game-state', {
      detail: { nearNPC: nearNPC ? { npcData: nearNPC.getInteractData() } : null }
    }));

    if (nearNPC && this.player.isInteracting()) {
      const data = nearNPC.getInteractData();
      window.dispatchEvent(new CustomEvent('start-dialogue', { detail: data }));
      window.dispatchEvent(new CustomEvent('dialogue-open'));
    }
  }
}