import { assertJson, freeze, object } from './validation.ts';
import { ValidationError } from './errors.ts';
import type { ReaderSelection, ReaderTag } from './types.ts';
export const readerTags: readonly ReaderTag[] = freeze([
  { id: 'concepts', label: '了解基本概念', group: '阅读目标', description: '寻找定义、概念和基础说明' },
  { id: 'engineering', label: '工程实践', group: '阅读目标', description: '关注实现、工具、训练和更新机制' },
  { id: 'research', label: '比较研究路线', group: '阅读目标', description: '关注分类、论文和方法比较' },
  { id: 'evaluation', label: '评估与验证', group: '阅读目标', description: '关注验收、评测、反馈与奖励' },
  { id: 'parameters', label: '参数与训练', group: '兴趣方向', description: '关注模型参数、权重和微调' },
  { id: 'context', label: '上下文', group: '兴趣方向', description: '关注上下文与 context' },
  { id: 'memory', label: '记忆', group: '兴趣方向', description: '关注持久记忆与 memory' },
  { id: 'skills', label: 'Skill 与技能', group: '兴趣方向', description: '关注 Skill 和可复用技能' },
  { id: 'harness', label: '工具与 Harness', group: '兴趣方向', description: '关注工具、代码和 Harness' },
  { id: 'structures', label: '演化结构', group: '兴趣方向', description: '关注链、树、图和结构' },
  { id: 'feedback', label: '反馈与验收', group: '兴趣方向', description: '关注反馈、评估、奖励和验收' },
  { id: 'deployment', label: '更新与部署', group: '兴趣方向', description: '关注离线、在线、混合更新和更新频率' }
]);
export const defaultReaderSelection = (): ReaderSelection => ({ tagIds: [], scope: 'catalog', mode: 'matched' });
export function normalizeReaderSelection(value: unknown): ReaderSelection {
  assertJson(value);
  const input = object(value, ['tagIds', 'scope', 'mode'], 'config.reader');
  if (!Array.isArray(input.tagIds) || input.tagIds.length > readerTags.length || new Set(input.tagIds).size !== input.tagIds.length || input.tagIds.some(id => typeof id !== 'string' || !readerTags.some(tag => tag.id === id))) throw new ValidationError('config.reader.tagIds');
  if (input.scope !== 'catalog' && input.scope !== 'selected') throw new ValidationError('config.reader.scope');
  if (input.mode !== 'full' && input.mode !== 'matched') throw new ValidationError('config.reader.mode');
  return { tagIds: [...input.tagIds] as string[], scope: input.scope, mode: input.mode };
}
