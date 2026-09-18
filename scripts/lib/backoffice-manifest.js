const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const MANIFEST_PATH = '.seorilabs/backoffice.json';
const ANALYTICS_PATH = 'packages/farm-core/src/analytics.ts';
const ADS_PATH = 'packages/farm-core/src/ads.ts';

const IDENT = /^[a-zA-Z0-9_-]{1,64}$/;
const ANALYTICS_IDENT = /^[a-zA-Z0-9_]{1,64}$/;
const TOOL_SECTIONS = new Set(['operations', 'commerce', 'ads', 'content', 'flags']);
const AGGREGATIONS = new Set(['count', 'users', 'sum', 'avg']);
const PREDICATE_OPERATORS = new Set(['eq', 'ne', 'ne_or_unset', 'gt', 'gte', 'lt', 'lte', 'truthy']);
const INPUT_TYPES = new Set(['text', 'number', 'boolean', 'select', 'textarea']);
function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function ownKeysOnly(value, allowed, at, failures) {
  if (!isObject(value)) {
    failures.push(`${at}: 객체여야 합니다.`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) failures.push(`${at}.${key}: 지원하지 않는 필드입니다.`);
  }
  return true;
}

function requiredString(value, at, failures, pattern) {
  if (typeof value !== 'string' || value.length === 0) {
    failures.push(`${at}: 비어 있지 않은 문자열이어야 합니다.`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    failures.push(`${at}: 식별자 규격에 맞지 않습니다.`);
    return false;
  }
  return true;
}

function stringValuesFromExpression(node) {
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isParenthesizedExpression(node)) return stringValuesFromExpression(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [...stringValuesFromExpression(node.whenTrue), ...stringValuesFromExpression(node.whenFalse)];
  }
  return [];
}

function propertyNameText(name) {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function extractGameContextParams(sourceFile) {
  const params = new Set();
  sourceFile.forEachChild((node) => {
    if (!ts.isTypeAliasDeclaration(node) || node.name.text !== 'GameAnalyticsContext') return;
    if (!ts.isTypeLiteralNode(node.type)) return;
    for (const member of node.type.members) {
      if (!ts.isPropertySignature(member)) continue;
      const name = propertyNameText(member.name);
      if (name) params.add(name);
    }
  });
  return params;
}

function paramsFromTrackArgument(node, contextParams) {
  const params = new Set();
  if (!node) return params;
  if (ts.isIdentifier(node) && node.text === 'context') {
    for (const param of contextParams) params.add(param);
    return params;
  }
  if (!ts.isObjectLiteralExpression(node)) return params;

  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = propertyNameText(property.name);
      if (name) params.add(name);
      continue;
    }
    if (
      ts.isSpreadAssignment(property) &&
      ((ts.isIdentifier(property.expression) && property.expression.text === 'context') ||
        (ts.isPropertyAccessExpression(property.expression) && property.expression.name.text === 'context'))
    ) {
      for (const param of contextParams) params.add(param);
    }
  }
  return params;
}

function extractAnalyticsCatalog(source) {
  const sourceFile = ts.createSourceFile(ANALYTICS_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const contextParams = extractGameContextParams(sourceFile);
  const catalog = new Map();

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'track') {
      const events = stringValuesFromExpression(node.arguments[0]);
      const params = paramsFromTrackArgument(node.arguments[1], contextParams);
      for (const event of events) {
        const known = catalog.get(event) ?? new Set();
        for (const param of params) known.add(param);
        catalog.set(event, known);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return catalog;
}

function extractRewardedAdPlacements(source) {
  const sourceFile = ts.createSourceFile(ADS_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const placements = new Set();

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'REWARDED_AD_PLACEMENTS' &&
      node.initializer
    ) {
      let initializer = node.initializer;
      if (ts.isAsExpression(initializer)) initializer = initializer.expression;
      if (ts.isObjectLiteralExpression(initializer)) {
        for (const property of initializer.properties) {
          if (ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)) {
            placements.add(property.initializer.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return placements;
}

function eventList(metric) {
  if (typeof metric?.event === 'string') return [metric.event];
  return Array.isArray(metric?.event) ? metric.event : [];
}

function validatePredicate(predicate, at, failures) {
  if (!ownKeysOnly(predicate, new Set(['param', 'op', 'value']), at, failures)) return;
  requiredString(predicate.param, `${at}.param`, failures, ANALYTICS_IDENT);
  if (!PREDICATE_OPERATORS.has(predicate.op)) {
    failures.push(`${at}.op: 지원하지 않는 연산자입니다.`);
  }
  if (predicate.op !== 'truthy' && predicate.value == null) {
    failures.push(`${at}.value: ${predicate.op} 연산에는 값이 필요합니다.`);
  }
}

function validateMetric(metric, at, failures) {
  if (
    !ownKeysOnly(metric, new Set(['key', 'label', 'event', 'agg', 'param', 'where', 'unit', 'round']), at, failures)
  ) {
    return;
  }
  requiredString(metric.key, `${at}.key`, failures, ANALYTICS_IDENT);
  requiredString(metric.label, `${at}.label`, failures);
  const events = eventList(metric);
  if (events.length === 0 || events.some((event) => !ANALYTICS_IDENT.test(event))) {
    failures.push(`${at}.event: 이벤트 식별자 또는 비어 있지 않은 배열이어야 합니다.`);
  }
  if (!AGGREGATIONS.has(metric.agg)) failures.push(`${at}.agg: 지원하지 않는 집계입니다.`);
  if ((metric.agg === 'sum' || metric.agg === 'avg') && !ANALYTICS_IDENT.test(metric.param ?? '')) {
    failures.push(`${at}.param: ${metric.agg} 집계에는 수치 파라미터가 필요합니다.`);
  }
  if (metric.where != null) {
    if (!Array.isArray(metric.where)) {
      failures.push(`${at}.where: 배열이어야 합니다.`);
    } else {
      metric.where.forEach((predicate, index) => validatePredicate(predicate, `${at}.where[${index}]`, failures));
    }
  }
}

function validateDerived(derived, metricKeys, at, failures) {
  if (!ownKeysOnly(derived, new Set(['key', 'label', 'num', 'den', 'scale', 'unit', 'round']), at, failures)) {
    return;
  }
  requiredString(derived.key, `${at}.key`, failures, ANALYTICS_IDENT);
  requiredString(derived.label, `${at}.label`, failures);
  if (!metricKeys.has(derived.num)) failures.push(`${at}.num: 존재하지 않는 지표 ${derived.num}입니다.`);
  if (!metricKeys.has(derived.den)) failures.push(`${at}.den: 존재하지 않는 지표 ${derived.den}입니다.`);
}

function validateContentShape(content, failures) {
  const allowed = new Set(['market', 'metrics', 'distributions', 'groups', 'derived']);
  if (!ownKeysOnly(content, allowed, 'analytics.content', failures)) return;

  if (content.market != null) {
    const at = 'analytics.content.market';
    if (ownKeysOnly(content.market, new Set(['param', 'platformMap', 'values']), at, failures)) {
      if (!Array.isArray(content.market.values) || content.market.values.length === 0) {
        failures.push(`${at}.values: 비어 있지 않은 배열이어야 합니다.`);
      }
      if (content.market.param != null) {
        requiredString(content.market.param, `${at}.param`, failures, ANALYTICS_IDENT);
      }
    }
  }

  const flatMetricKeys = new Set();
  if (!Array.isArray(content.metrics)) {
    failures.push('analytics.content.metrics: 배열이어야 합니다.');
  } else {
    content.metrics.forEach((metric, index) => {
      validateMetric(metric, `analytics.content.metrics[${index}]`, failures);
      if (flatMetricKeys.has(metric?.key)) {
        failures.push(`analytics.content.metrics[${index}].key: 중복 지표 ${metric.key}입니다.`);
      }
      if (typeof metric?.key === 'string') flatMetricKeys.add(metric.key);
    });
  }

  if (content.distributions != null) {
    if (!Array.isArray(content.distributions)) {
      failures.push('analytics.content.distributions: 배열이어야 합니다.');
    } else {
      content.distributions.forEach((distribution, index) => {
        const at = `analytics.content.distributions[${index}]`;
        if (
          ownKeysOnly(
            distribution,
            new Set(['key', 'label', 'event', 'param', 'topN', 'valueLabels', 'where']),
            at,
            failures
          )
        ) {
          requiredString(distribution.key, `${at}.key`, failures, ANALYTICS_IDENT);
          requiredString(distribution.label, `${at}.label`, failures);
          requiredString(distribution.event, `${at}.event`, failures, ANALYTICS_IDENT);
          requiredString(distribution.param, `${at}.param`, failures, ANALYTICS_IDENT);
        }
      });
    }
  }

  if (!Array.isArray(content.groups) || content.groups.length === 0) {
    failures.push('analytics.content.groups: 비어 있지 않은 배열이어야 합니다.');
  } else {
    content.groups.forEach((group, groupIndex) => {
      const at = `analytics.content.groups[${groupIndex}]`;
      if (
        !ownKeysOnly(
          group,
          new Set(['key', 'label', 'param', 'metrics', 'derived', 'valueLabels', 'topN', 'orderBy', 'order', 'render']),
          at,
          failures
        )
      ) {
        return;
      }
      requiredString(group.key, `${at}.key`, failures, ANALYTICS_IDENT);
      requiredString(group.label, `${at}.label`, failures);
      requiredString(group.param, `${at}.param`, failures, ANALYTICS_IDENT);
      const groupMetricKeys = new Set();
      if (!Array.isArray(group.metrics) || group.metrics.length === 0) {
        failures.push(`${at}.metrics: 비어 있지 않은 배열이어야 합니다.`);
      } else {
        group.metrics.forEach((metric, metricIndex) => {
          validateMetric(metric, `${at}.metrics[${metricIndex}]`, failures);
          if (groupMetricKeys.has(metric?.key)) {
            failures.push(`${at}.metrics[${metricIndex}].key: 중복 지표 ${metric.key}입니다.`);
          }
          if (typeof metric?.key === 'string') groupMetricKeys.add(metric.key);
        });
      }
      if (group.derived != null) {
        if (!Array.isArray(group.derived)) {
          failures.push(`${at}.derived: 배열이어야 합니다.`);
        } else {
          group.derived.forEach((derived, index) =>
            validateDerived(derived, groupMetricKeys, `${at}.derived[${index}]`, failures)
          );
        }
      }
      if (group.orderBy != null && !groupMetricKeys.has(group.orderBy)) {
        failures.push(`${at}.orderBy: 존재하지 않는 지표 ${group.orderBy}입니다.`);
      }
    });
  }

  if (content.derived != null) {
    if (!Array.isArray(content.derived)) {
      failures.push('analytics.content.derived: 배열이어야 합니다.');
    } else {
      content.derived.forEach((derived, index) =>
        validateDerived(derived, flatMetricKeys, `analytics.content.derived[${index}]`, failures)
      );
    }
  }
}

function validateManifestShape(manifest, rootDir, failures) {
  if (!ownKeysOnly(manifest, new Set(['$schema', 'version', 'summary', 'tools', 'analytics']), 'manifest', failures)) {
    return;
  }
  if (manifest.version !== 1) failures.push('manifest.version: 1이어야 합니다.');
  requiredString(manifest.summary, 'manifest.summary', failures);
  if (!Array.isArray(manifest.tools) || manifest.tools.length === 0) {
    failures.push('manifest.tools: 비어 있지 않은 배열이어야 합니다.');
  } else {
    const toolIds = new Set();
    manifest.tools.forEach((tool, toolIndex) => {
      const at = `manifest.tools[${toolIndex}]`;
      if (
        !ownKeysOnly(tool, new Set(['id', 'section', 'title', 'description', 'runbook', 'operations']), at, failures)
      ) {
        return;
      }
      requiredString(tool.id, `${at}.id`, failures, IDENT);
      if (toolIds.has(tool.id)) failures.push(`${at}.id: 중복 tool id ${tool.id}입니다.`);
      toolIds.add(tool.id);
      if (!TOOL_SECTIONS.has(tool.section)) failures.push(`${at}.section: 지원하지 않는 섹션입니다.`);
      requiredString(tool.title, `${at}.title`, failures);
      requiredString(tool.description, `${at}.description`, failures);
      if (typeof tool.runbook !== 'string' || !tool.runbook.startsWith('docs/')) {
        failures.push(`${at}.runbook: docs/ 아래 경로가 필요합니다.`);
      } else if (!fs.existsSync(path.join(rootDir, tool.runbook))) {
        failures.push(`${at}.runbook: 파일이 존재하지 않습니다(${tool.runbook}).`);
      }
      if (!Array.isArray(tool.operations)) {
        failures.push(`${at}.operations: 배열이어야 합니다.`);
        return;
      }
      const operationIds = new Set();
      tool.operations.forEach((operation, operationIndex) => {
        const operationAt = `${at}.operations[${operationIndex}]`;
        if (
          !ownKeysOnly(
            operation,
            new Set(['id', 'label', 'description', 'intent', 'risk', 'confirmation', 'inputs']),
            operationAt,
            failures
          )
        ) {
          return;
        }
        requiredString(operation.id, `${operationAt}.id`, failures, IDENT);
        if (operationIds.has(operation.id)) {
          failures.push(`${operationAt}.id: 같은 도구 안의 중복 operation id입니다.`);
        }
        operationIds.add(operation.id);
        requiredString(operation.label, `${operationAt}.label`, failures);
        if (operation.intent !== 'read' && operation.intent !== 'mutate') {
          failures.push(`${operationAt}.intent: read 또는 mutate여야 합니다.`);
        }
        if (
          operation.intent === 'mutate' &&
          operation.confirmation !== 'reason' &&
          operation.confirmation !== 'typed'
        ) {
          failures.push(`${operationAt}.confirmation: 변경에는 reason 또는 typed 확인이 필요합니다.`);
        }
        if (operation.risk === 'high' && operation.confirmation !== 'typed') {
          failures.push(`${operationAt}.confirmation: high 위험은 typed 확인이 필요합니다.`);
        }
        if (operation.inputs != null && !Array.isArray(operation.inputs)) {
          failures.push(`${operationAt}.inputs: 배열이어야 합니다.`);
          return;
        }
        for (const [inputIndex, input] of (operation.inputs ?? []).entries()) {
          const inputAt = `${operationAt}.inputs[${inputIndex}]`;
          if (
            !ownKeysOnly(
              input,
              new Set(['key', 'label', 'type', 'required', 'placeholder', 'help', 'options']),
              inputAt,
              failures
            )
          ) {
            continue;
          }
          requiredString(input.key, `${inputAt}.key`, failures, IDENT);
          requiredString(input.label, `${inputAt}.label`, failures);
          if (!INPUT_TYPES.has(input.type)) failures.push(`${inputAt}.type: 지원하지 않는 입력입니다.`);
          if (input.type === 'select' && (!Array.isArray(input.options) || input.options.length === 0)) {
            failures.push(`${inputAt}.options: select에는 선택지가 필요합니다.`);
          }
        }
      });
    });
  }

  if (!isObject(manifest.analytics) || !isObject(manifest.analytics.content)) {
    failures.push('manifest.analytics.content: 전용 콘텐츠 분석 계약이 필요합니다.');
  } else {
    ownKeysOnly(manifest.analytics, new Set(['content']), 'manifest.analytics', failures);
    validateContentShape(manifest.analytics.content, failures);
  }
}

function optionValuesForInput(manifest, key) {
  const values = new Set();
  for (const tool of manifest.tools ?? []) {
    for (const operation of tool.operations ?? []) {
      for (const input of operation.inputs ?? []) {
        if (input.key !== key) continue;
        for (const option of input.options ?? []) {
          if (typeof option.value === 'string') values.add(option.value);
        }
      }
    }
  }
  return values;
}

function validateAnalyticsReferences(content, catalog, failures) {
  function validateReference(events, param, at, allowUnset = false) {
    let knownEventCount = 0;
    let knownParamCount = 0;
    for (const event of events) {
      const knownParams = catalog.get(event);
      if (!knownParams) {
        failures.push(`${at}: analytics.ts에 없는 이벤트 ${event}입니다.`);
        continue;
      }
      knownEventCount += 1;
      if (param && knownParams.has(param)) {
        knownParamCount += 1;
      } else if (param && !allowUnset) {
        failures.push(`${at}: ${event}에 없는 파라미터 ${param}입니다.`);
      }
    }
    if (param && allowUnset && knownEventCount > 0 && knownParamCount === 0) {
      failures.push(`${at}: 모든 이벤트에 없는 파라미터 ${param}입니다.`);
    }
  }

  for (const [index, metric] of (content.metrics ?? []).entries()) {
    const events = eventList(metric);
    validateReference(events, metric.param, `analytics.content.metrics[${index}]`);
    for (const predicate of metric.where ?? []) {
      validateReference(events, predicate.param, `analytics.content.metrics[${index}].where`, predicate.op === 'ne_or_unset');
    }
  }
  for (const [index, distribution] of (content.distributions ?? []).entries()) {
    validateReference([distribution.event], distribution.param, `analytics.content.distributions[${index}]`);
    for (const predicate of distribution.where ?? []) {
      validateReference([distribution.event], predicate.param, `analytics.content.distributions[${index}].where`, predicate.op === 'ne_or_unset');
    }
  }
  for (const [groupIndex, group] of (content.groups ?? []).entries()) {
    for (const [metricIndex, metric] of (group.metrics ?? []).entries()) {
      const events = eventList(metric);
      const at = `analytics.content.groups[${groupIndex}].metrics[${metricIndex}]`;
      validateReference(events, group.param, `${at}.groupParam`);
      validateReference(events, metric.param, at);
      for (const predicate of metric.where ?? []) {
        validateReference(events, predicate.param, `${at}.where`, predicate.op === 'ne_or_unset');
      }
    }
  }
}

function validateBackofficeManifest(rootDir = process.cwd()) {
  const failures = [];
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, MANIFEST_PATH), 'utf8'));
  validateManifestShape(manifest, rootDir, failures);

  if (isObject(manifest.analytics?.content)) {
    const analyticsSource = fs.readFileSync(path.join(rootDir, ANALYTICS_PATH), 'utf8');
    validateAnalyticsReferences(manifest.analytics.content, extractAnalyticsCatalog(analyticsSource), failures);
  }

  const adsSource = fs.readFileSync(path.join(rootDir, ADS_PATH), 'utf8');
  const sourcePlacements = extractRewardedAdPlacements(adsSource);
  const manifestPlacements = optionValuesForInput(manifest, 'placement');
  for (const placement of sourcePlacements) {
    if (!manifestPlacements.has(placement)) {
      failures.push(`광고 placement 누락: ${placement}`);
    }
  }
  for (const placement of manifestPlacements) {
    if (!sourcePlacements.has(placement)) {
      failures.push(`게임에 없는 광고 placement: ${placement}`);
    }
  }

  return { manifest, failures };
}

module.exports = {
  extractAnalyticsCatalog,
  extractRewardedAdPlacements,
  validateBackofficeManifest,
};
