// backend/fieldExtraction.js
// Modulo puro (sem I/O, sem dependencias externas) responsavel por extrair
// os campos de um work item do Azure DevOps, respeitando o mapeamento
// configurado pelo admin (fm = field_mappings). Extraido de syncData() em
// server.js para ficar testavel isoladamente sem subir Express/Postgres.

// Extract team from Area Path
function extractTeam(areaPath) {
  if (!areaPath) return 'Sem Time';
  const parts = areaPath.split('\\');
  return parts.length > 1 ? parts[parts.length - 1] : areaPath;
}

// Extrai todos os campos "de negocio" de um work item, respeitando fm (field_mappings).
// fields: objeto "fields" retornado pela API do Azure DevOps para um work item.
// fm: mapeamento configurado pelo admin ({ chaveInterna: 'Custom.ReferenceName', ... }).
function extractWorkItemFields(fields, fm) {
  const fld = (key, ...defaults) => {
    if (fm[key]) return fields[fm[key]] ?? null;
    for (const d of defaults) { const v = fields[d]; if (v !== undefined && v !== null) return v; }
    return null;
  };

  const title = fld('title', 'System.Title') || '';
  const state = fld('state', 'System.State') || '';
  const type = fld('type', 'System.WorkItemType') || '';
  const rawAssignedTo = fld('assignedTo', 'System.AssignedTo');
  const assignedTo = rawAssignedTo?.displayName || (typeof rawAssignedTo === 'string' ? rawAssignedTo : '') || '';
  const areaPath = fld('areaPath', 'System.AreaPath') || '';
  const team = extractTeam(areaPath);
  const iterationPath = fld('iterationPath', 'System.IterationPath') || '';
  const createdDate = fld('createdDate', 'System.CreatedDate') || '';
  const changedDate = fld('changedDate', 'System.ChangedDate') || '';
  const closedDate = fld('closedDate', 'Microsoft.VSTS.Common.ClosedDate') || '';
  const tags = fld('tags', 'System.Tags') || '';
  const priority = fld('priority', 'Microsoft.VSTS.Common.Priority')?.toString() || '';
  const activatedDate = fld('activatedDate', 'Microsoft.VSTS.Common.ActivatedDate') || '';
  const storyPoints = fld('storyPoints', 'Microsoft.VSTS.Scheduling.StoryPoints') || null;
  const tipoCliente = fld('tipoCliente', 'Custom.Tipocliente', 'Custom.TipoCliente', 'Custom.tipocliente') || '';

  // Campos customizados adicionais
  // Nível 1 e Nível 2 - campos identity com GUID no Azure DevOps
  const nivel1Field = fields[fm['codeReviewLevel1'] || 'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028'];
  const nivel2Field = fields[fm['codeReviewLevel2'] || 'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e'];
  const codeReviewLevel1 = nivel1Field?.displayName || (typeof nivel1Field === 'string' ? nivel1Field : '') || '';
  const codeReviewLevel2 = nivel2Field?.displayName || (typeof nivel2Field === 'string' ? nivel2Field : '') || '';
  const customType = fld('customType', 'Custom.Type', 'Custom.CustomType') || '';
  const rootCauseStatus = fld('rootCauseStatus', 'Custom.RootCauseStatus', 'Custom.StatusCausaRaiz') || '';
  const squad = fld('squad', 'Custom.Squad') || '';
  const area = fld('area', 'Custom.Area') || '';
  const complexity = fld('complexity', 'Custom.Complexity', 'Custom.Complexidade') || '';
  const reincidencia = fld('reincidencia', 'Custom.REINCIDENCIA', 'Custom.Reincidencia', 'Custom.Reincidência') || '';
  const performanceDays = fld('performanceDays', 'Custom.PerformanceDays', 'Custom.DiasPerformance') || '';
  const rawQa = fld('qa', 'Custom.QA');
  const qa = rawQa?.displayName || (typeof rawQa === 'string' ? rawQa : '') || '';
  const causaRaiz = fld('causaRaiz', 'Custom.Raizdoproblema') || '';
  const rootCauseLegacy = fld('rootCauseLegacy', 'Microsoft.VSTS.CMMI.RootCause') || '';
  const rawCreatedBy = fld('createdBy', 'System.CreatedBy');
  const createdBy = rawCreatedBy?.displayName || (typeof rawCreatedBy === 'string' ? rawCreatedBy : '') || '';
  const rawPo = fld('po', 'Custom.PO', 'Custom.ProductOwner');
  const po = rawPo?.displayName || (typeof rawPo === 'string' ? rawPo : '') || '';
  const readyDate = fld('readyDate', 'Custom.DOR') || '';
  const doneDate = fld('doneDate', 'Custom.DOD') || '';
  // Novos campos de Root Cause
  const rootCauseTask = fld('rootCauseTask', 'Custom.Rootcausetask') || '';
  const rootCauseTeam = fld('rootCauseTeam', 'Custom.rootcauseteam') || '';
  const rootCauseVersion = fld('rootCauseVersion', 'Custom.rootcauseversion') || '';
  const rawDev = fld('dev', 'Custom.DEV');
  const dev = rawDev?.displayName || (typeof rawDev === 'string' ? rawDev : '') || '';
  const platform = fld('platform', 'Custom.Platform') || '';
  const application = fld('application', 'Custom.Aplication', 'Custom.Application') || '';
  const branchBase = fld('branchBase', 'Custom.BranchBase') || '';
  const deliveredVersion = fld('deliveredVersion', 'Custom.DeliveredVersion') || '';
  const baseVersion = fld('baseVersion', 'Custom.BaseVersion') || '';
  // Campos de Identificação e Falha do Processo
  const identificacao = fld('identificacao', 'Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5') || '';
  const falhaDoProcesso = fld('falhaDoProcesso', 'Custom.Falhadoprocesso') || '';
  const impedimento = fields[fm['impedimento'] || 'Custom.Impedimento'] === true;
  const bloqueio    = fields[fm['bloqueio']    || 'Custom.Bloqueio']    === true;
  const categoria = fld('categoria', 'Custom.Category', 'Custom.Categoria') || null;

  return {
    title, state, type, assignedTo, areaPath, team, iterationPath, createdDate, changedDate, closedDate,
    tags, priority, activatedDate, storyPoints, tipoCliente,
    codeReviewLevel1, codeReviewLevel2, customType, rootCauseStatus, squad, area, complexity,
    reincidencia, performanceDays, qa, causaRaiz, rootCauseLegacy, createdBy, po, readyDate, doneDate,
    rootCauseTask, rootCauseTeam, rootCauseVersion, dev, platform, application, branchBase,
    deliveredVersion, baseVersion, identificacao, falhaDoProcesso, impedimento, bloqueio, categoria,
  };
}

// Extrai candidatos a avatar (nome + foto) de um work item, respeitando fm.
// Retorna uma lista de { displayName, imageUrl } (pode ter 0 a 4 entradas por item).
function extractAvatarCandidates(fields, fm) {
  const candidates = [];
  const assignedToObj = fields[fm['assignedTo'] || 'System.AssignedTo'];
  if (assignedToObj?.displayName && assignedToObj?.imageUrl) {
    candidates.push({ displayName: assignedToObj.displayName, imageUrl: assignedToObj.imageUrl });
  }
  const createdByObj = fields[fm['createdBy'] || 'System.CreatedBy'];
  if (createdByObj?.displayName && createdByObj?.imageUrl) {
    candidates.push({ displayName: createdByObj.displayName, imageUrl: createdByObj.imageUrl });
  }
  const poObj = fm['po'] ? fields[fm['po']] : (fields['Custom.PO'] || fields['Custom.ProductOwner']);
  if (poObj?.displayName && poObj?.imageUrl) {
    candidates.push({ displayName: poObj.displayName, imageUrl: poObj.imageUrl });
  }
  const qaObj = fm['qa'] ? fields[fm['qa']] : fields['Custom.QA'];
  if (qaObj?.displayName && qaObj?.imageUrl) {
    candidates.push({ displayName: qaObj.displayName, imageUrl: qaObj.imageUrl });
  }
  return candidates;
}

module.exports = { extractTeam, extractWorkItemFields, extractAvatarCandidates };
