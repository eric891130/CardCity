import { state } from './state.js';

const builtCount = () => Math.max(0, state.board.filter(cell => cell.building).length - (state.achievementStartingBuildingCount || 0));
const uniqueBuildingCount = () => new Set(state.board.filter(cell => cell.building && !(state.achievementStartingBuildingTypes || []).includes(cell.building)).map(cell => cell.building)).size;
const unlockedKnowledgeCount = () => Object.keys(state.unlockedTechs || {}).length + Object.keys(state.unlockedCultures || {}).length;
const highestBuildingLevel = () => Math.max(0, ...state.board.filter(cell => cell.building).map(cell => cell.level || 1));

export const ACHIEVEMENTS = [
  { id: 'first_building', title: '城市的第一塊磚', description: '建造第一座建築。', points: 5, progress: () => [Math.min(builtCount(), 1), 1] },
  { id: 'busy_city', title: '街坊開始熱鬧', description: '同時建成 5 座建築。', points: 10, progress: () => [Math.min(builtCount(), 5), 5] },
  { id: 'city_diversity', title: '百業俱興', description: '建造 5 種不同的建築。', points: 15, progress: () => [Math.min(uniqueBuildingCount(), 5), 5] },
  { id: 'master_builder', title: '地標建築', description: '將任一建築升級至 Lv.3。', points: 15, progress: () => [Math.min(highestBuildingLevel(), 3), 3] },
  { id: 'full_granary', title: '糧倉滿滿', description: '存糧累積至 30。', points: 10, progress: () => [Math.min(Math.floor(state.storedFood || 0), 30), 30] },
  { id: 'scholar_city', title: '學城風氣', description: '累計解鎖 6 項科技與文化。', points: 15, progress: () => [Math.min(unlockedKnowledgeCount(), 6), 6] },
  { id: 'large_population', title: '人口大城', description: '人口上限達到 20。', points: 20, progress: () => [Math.min(state.maxPopulation || 0, 20), 20] },
  { id: 'rich_city', title: '金庫充盈', description: '持有 100 枚金幣。', points: 15, progress: () => [Math.min(state.gold || 0, 100), 100] }
];

export function updateAchievements() {
  if(!Array.isArray(state.unlockedAchievements)) state.unlockedAchievements = [];
  const newlyUnlocked = [];
  for(const achievement of ACHIEVEMENTS){
    if(state.unlockedAchievements.includes(achievement.id)) continue;
    const [current, target] = achievement.progress();
    if(current >= target){
      state.unlockedAchievements.push(achievement.id);
      newlyUnlocked.push(achievement);
    }
  }
  state.achievementScore = getAchievementScore();
  return newlyUnlocked;
}

export function getAchievementScore() {
  const unlocked = new Set(state?.unlockedAchievements || []);
  return ACHIEVEMENTS.reduce((total, achievement) => total + (unlocked.has(achievement.id) ? achievement.points : 0), 0);
}

export function renderAchievements() {
  const container = document.getElementById('achievementsContainer');
  if(!container) return;
  const unlocked = new Set(state.unlockedAchievements || []);
  const score = getAchievementScore();
  document.getElementById('achievementScoreLabel').textContent = `🏆 ${score} 分`;
  container.innerHTML = ACHIEVEMENTS.map(achievement => {
    const isUnlocked = unlocked.has(achievement.id);
    const [current, target] = achievement.progress();
    const percent = Math.min(100, Math.floor(current / target * 100));
    return `<article class="achievement${isUnlocked ? ' unlocked' : ''}">
      <div class="achievement-icon">${isUnlocked ? '🏆' : '🔒'}</div>
      <div class="achievement-info">
        <div class="achievement-title">${achievement.title}<span>+${achievement.points} ★</span></div>
        <p>${achievement.description}</p>
        <div class="progress"><i style="width:${isUnlocked ? 100 : percent}%"></i></div>
        <small>${isUnlocked ? '已解鎖' : `進度 ${current} / ${target}`}</small>
      </div>
    </article>`;
  }).join('');
}
