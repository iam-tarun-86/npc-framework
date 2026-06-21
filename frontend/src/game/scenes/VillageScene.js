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

    // Seeded random for consistent grass variation
    let seed = 12345;
    const random = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const tileType = TILE_MAP[y][x];
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Grass with 3 color variations
        const grassColors = [0x4a7c4e, 0x4e8052, 0x467a4a, 0x528256];
        const pathColors = [0xC4A484, 0xba9a7a, 0xd4b494];

        let color;
        if (tileType === 0) {
          color = grassColors[Math.floor(random() * grassColors.length)];
        } else if (tileType === 3) {
          color = pathColors[Math.floor(random() * pathColors.length)];
        } else {
          color = { 1: 0x2d5a27, 2: 0x8B4513 }[tileType] || 0x4a7c4e;
        }

        graphics.fillStyle(color, 1);
        graphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Tree with leaves
        if (tileType === 1) {
          // Trunk
          graphics.fillStyle(0x5C4033, 1);
          graphics.fillRect(px + 6, py + 8, 4, 8);
          // Leaves
          graphics.fillStyle(0x2d5a27, 1);
          graphics.fillCircle(px + 8, py + 6, 5);
          graphics.fillStyle(0x3a6b32, 0.8);
          graphics.fillCircle(px + 6, py + 4, 3);
          graphics.fillCircle(px + 10, py + 5, 3);
        }
        // House with roof and door
        else if (tileType === 2) {
          // Walls
          graphics.fillStyle(0x8B4513, 1);
          graphics.fillRect(px + 2, py + 6, 12, 10);
          // Roof
          graphics.fillStyle(0x654321, 1);
          graphics.fillTriangle(px, py + 6, px + 8, py - 2, px + 16, py + 6);
          // Door
          graphics.fillStyle(0x3d2817, 1);
          graphics.fillRect(px + 6, py + 10, 4, 6);
        }
      }
    }
  }

  getNPCFrame(key) {
    const frames = { alaric: 432, borin: 487, vexis: 433, mira: 325 };
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