import { McpApp, parseToolResult } from '@privos_ai/app-react';
import { EmployeeProfile, ILifecycleService, PassedCandidate } from '../types';

export class PrivOSLifecycleService implements ILifecycleService {
  private static readonly SYSTEM_PREFIX = '[HR-MCP-App]';
  private static readonly LEGACY_EXACT_NAME = 'Hồ sơ nhân sự';
  private static readonly SYSTEM_CONFIG_NAME = '[Hệ thống] Không xoá - Cấu hình Kanban';
  private static readonly DEFAULT_STAGE = 'Mới nhận việc';

  /** One `mcpapp.lists.getItems` page. 100 is the value this call has used since the migration. */
  private static readonly ITEMS_PAGE_SIZE = 100;

  /** 100 × 100 = 10,000 items — the same ceiling `PAYROLL_MAX_PAGES` gives the payroll read. */
  private static readonly ITEMS_MAX_PAGES = 100;

  constructor(private app: McpApp) { }

  async loadProfiles(roomId: string): Promise<EmployeeProfile[]> {
    // Never answer a failure with `[]`. PayrollDashboard reconciles payroll rows
    // against this roster and hard-deletes the ones it cannot match, so a masked
    // failure here destroys real salary data.
    const list = await this.ensureValidList(roomId);
    if (!list || !(list._id || list.id)) {
      throw new Error(`Không lấy được danh sách hồ sơ nhân sự hợp lệ của room ${roomId}.`);
    }

    const items = await this.fetchListItems(list._id || list.id);
    const fieldDefMap = this.createFieldDefinitionMap(list.fieldDefinitions);

    return items
      .filter(item => !this.isSystemConfigItem(item))
      .map(item => this.mapItemToProfile(item, list, fieldDefMap));
  }

  async loadPassedCandidates(roomId: string): Promise<PassedCandidate[]> {
    try {
      const allLists = await this.fetchAllLists(roomId);
      const screeningLists = allLists.filter(list => this.isScreeningList(list));

      console.log(`[PrivOSLifecycleService] Found ${allLists.length} lists in room, ${screeningLists.length} candidate lists:`,
        screeningLists.map(l => l.name)
      );

      if (screeningLists.length === 0) return [];

      const candidatesPromises = screeningLists.map(async (list) => {
        const listId = list._id || list.id;
        let stages = list.stages;
        if (!Array.isArray(stages) || stages.length === 0) {
          stages = await this.fetchListStages(listId);
        }

        const items = await this.fetchListItems(listId);
        const validItems = items.filter(item => !this.isSystemConfigItem(item));
        const passedItems = validItems.filter(item => this.isPassedCandidateItem(item, stages));

        console.log(`[PrivOSLifecycleService] List "${list.name}" (${listId}): ${validItems.length} total items, ${passedItems.length} stage 05+ candidates`);

        return passedItems.map(item => this.mapItemToPassedCandidate(item, { ...list, stages }));
      });

      const candidatesNested = await Promise.all(candidatesPromises);
      const allCandidates = candidatesNested.flat();

      console.log(`[PrivOSLifecycleService] Total loaded passed candidates (Stage 05+): ${allCandidates.length}`);

      // Sort by score descending (highest score first)
      return allCandidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } catch (err) {
      console.error('[PrivOSLifecycleService] Error loading passed candidates:', err);
      return [];
    }
  }



  async createProfile(roomId: string, data: Omit<EmployeeProfile, '_id' | 'status'> & { attachedFileObj?: any }): Promise<EmployeeProfile> {
    try {
      const list = await this.ensureValidList(roomId);
      if (list) {
        const customFields = this.buildCustomFieldsForCreation(data, list.fieldDefinitions);

        let fileObjToSave = data.attachedFileObj || null;
        let fileId = fileObjToSave?._id || fileObjToSave?.id || null;
        let fileDownloadUrl = fileObjToSave?.downloadUrl || fileObjToSave?.url || null;
        const debugLog: string[] = [];

        if (fileObjToSave) {
          // Tìm trường có type là DOCUMENT hoặc tên chứa 'hồ sơ' / 'document'
          const fileFieldDef = (list.fieldDefinitions || []).find((fd: any) =>
            fd.type === 'DOCUMENT' ||
            (fd.name || '').toLowerCase().includes('hồ sơ') ||
            (fd.name || '').toLowerCase().includes('document')
          );
          if (fileFieldDef) {
            customFields.push({ fieldId: fileFieldDef._id || fileFieldDef.id, value: [fileObjToSave] });
          }
        }

        const descriptionParts = [];
        // Hiển thị debug log lên UI
        if (typeof debugLog !== 'undefined' && debugLog.length > 0) {
          descriptionParts.push(`**Debug ID:** ${debugLog.join(' | ')}`);
        }

        if (data.sourceCandidateId) {
          descriptionParts.push(`[sourceCandidateId:${data.sourceCandidateId}]`);
        }
        if (fileId) {
          descriptionParts.push(`[fileId:${fileId}]`);
        } else if (fileDownloadUrl) {
          descriptionParts.push(`[fileUrl:${fileDownloadUrl}]`);
        }

        const res: any = await this.app.callServerTool({
          name: 'mcpapp.lists.createItem',
          arguments: {
            listId: list._id || list.id,
            title: data.name,
            customFields,
            ...(descriptionParts.length > 0 ? { description: descriptionParts.join('\n\n') } : {})
          }
        });

        const parsed = JSON.parse(res?.content?.[0]?.text || '{}');
        return {
          ...data,
          _id: parsed._id || parsed.id || this.generateLocalId(),
          status: PrivOSLifecycleService.DEFAULT_STAGE
        };
      }
    } catch (err) {
      console.error('[PrivOSLifecycleService] Connection error when creating profile:', err);
    }

    // Fallback if failed
    return {
      ...data,
      _id: this.generateLocalId(),
      status: PrivOSLifecycleService.DEFAULT_STAGE
    };
  }

  async updateProfileStatus(roomId: string, profileId: string, newStatus: string): Promise<void> {
    try {
      const list = await this.ensureValidList(roomId);
      if (!list || !Array.isArray(list.stages)) {
        console.warn('[PrivOSLifecycleService] Cannot update stage: list or stages not found');
        return;
      }

      // Find stage matching newStatus
      const targetStage = list.stages.find(
        (s: any) => s.name === newStatus || (s.name || '').toLowerCase() === newStatus.toLowerCase()
      );

      if (!targetStage) {
        console.warn(`[PrivOSLifecycleService] Target stage "${newStatus}" not found in list stages:`, list.stages);
        return;
      }

      const stageId = targetStage._id || targetStage.id;
      if (!stageId) {
        console.warn(`[PrivOSLifecycleService] Target stage "${newStatus}" does not have a valid stageId:`, targetStage);
        return;
      }

      await this.app.callServerTool({
        name: 'mcpapp.lists.moveItemToStage',
        arguments: {
          itemId: profileId,
          stageId
        }
      });
      console.log(`[PrivOSLifecycleService] Successfully moved profile ${profileId} to stage ${newStatus} (${stageId})`);
    } catch (err) {
      console.error('[PrivOSLifecycleService] Failed to move profile to stage:', err);
      throw err;
    }
  }

  // --- Private Helper Methods ---

  private generateLocalId(): string {
    return `local-${Date.now()}`;
  }

  private async ensureValidList(roomId: string): Promise<any> {
    const existing = await this.findExistingList(roomId);
    if (existing) return this.enrichListWithStages(existing);
    return this.createNewList(roomId);
  }

  private async findExistingList(roomId: string): Promise<any | null> {
    console.log('[PrivOSLifecycleService] findExistingList called for roomId:', roomId);
    const res: any = await this.app.callServerTool({
      name: 'mcpapp.lists.getAll',
      arguments: { roomId }
    });

    const parsed: any = parseToolResult(res);
    const lists = Array.isArray(parsed) ? parsed : (parsed?.lists || []);
    console.log('[PrivOSLifecycleService] Total lists found:', lists.length);

    // Chuyển sang dùng Exact Match hoặc System Prefix thay vì fuzzy search (.includes)
    const foundList = lists.find((l: any) => {
      const name = l.name || '';
      return name.startsWith(PrivOSLifecycleService.SYSTEM_PREFIX) || name === PrivOSLifecycleService.LEGACY_EXACT_NAME;
    }) || null;
    console.log('[PrivOSLifecycleService] Found matching list:', foundList ? foundList.name : 'none');
    return foundList;
  }

  /**
   * Attach the Kanban stage config stored on the list's system config item.
   *
   * This NEVER deletes the list. It used to: a failed `JSON.parse` of the config item's
   * description, or an empty stage array, dropped the entire employee roster and provisioned a
   * fresh empty one. `PayrollDashboard` then reconciled every payroll row against that empty
   * roster and deleted all of them. A corrupt stage config is a config problem; it is not a
   * reason to destroy employee records or the salary rows that hang off them.
   */
  private async enrichListWithStages(list: any): Promise<any> {
    const listId = list._id || list.id;
    const configItem = await this.fetchSystemConfigItem(listId);

    // A MISSING config item is repairable and must be repaired: `createNewList` only writes one
    // when `mcpapp.lists.create` echoes stages back, so a room can legitimately have none — and
    // such a room is exactly the one the removed delete-and-recreate loop used to "fix", so it is
    // a likely real-world state. Throwing here would brick it permanently. A CORRUPT item is a
    // different case and still throws below: unreadable data must not be guessed at.
    if (!configItem) return this.repairMissingStageConfig(list, listId);

    if (configItem.description) {
      try {
        list.stages = JSON.parse(configItem.description);
      } catch (error) {
        throw new Error(
          `Cấu hình Kanban của danh sách hồ sơ nhân sự (${listId}) không đọc được: ${(error as Error).message}. `
          + 'Sửa lại item "[Hệ thống] Không xoá - Cấu hình Kanban" trong Room. Danh sách hồ sơ được giữ nguyên.'
        );
      }
    }

    if (!this.isValidStagesArray(list.stages)) {
      throw new Error(
        `Danh sách hồ sơ nhân sự (${listId}) không có stage nào. `
        + 'Khôi phục item "[Hệ thống] Không xoá - Cấu hình Kanban" trong Room. Danh sách hồ sơ được giữ nguyên.'
      );
    }

    return list;
  }

  /**
   * Rebuild the stage config for a list that has no system config item at all.
   *
   * Stages are recovered from the list itself first, then from `mcpapp.stages.getByList`; if either
   * yields some, the config item is written back so the next load is clean. Only a list with no
   * stages available from ANY source throws. NOTHING is deleted on any path — that is the binding
   * requirement this whole change exists to hold, and a re-create failure is not allowed to turn a
   * readable roster into an outage either, so it only warns.
   */
  private async repairMissingStageConfig(list: any, listId: string): Promise<any> {
    if (!this.isValidStagesArray(list.stages)) {
      list.stages = await this.fetchListStages(listId);
    }

    if (!this.isValidStagesArray(list.stages)) {
      throw new Error(
        `Danh sách hồ sơ nhân sự (${listId}) không có stage nào và không khôi phục được từ đâu. `
        + 'Khôi phục item "[Hệ thống] Không xoá - Cấu hình Kanban" trong Room. Danh sách hồ sơ được giữ nguyên.'
      );
    }

    try {
      await this.createSystemConfigItem(listId, list.stages);
    } catch (error) {
      console.warn(`[PrivOSLifecycleService] Could not re-create the Kanban config item for list ${listId}:`, error);
    }

    return list;
  }

  private isValidStagesArray(stages: any): boolean {
    return Array.isArray(stages) && stages.length > 0;
  }

  private async fetchSystemConfigItem(listId: string): Promise<any | null> {
    const searchRes: any = await this.app.callServerTool({
      name: 'mcpapp.lists.searchItems',
      arguments: { listId, query: '[Hệ thống] Không xoá' }
    });

    const searchParsed = JSON.parse(searchRes?.content?.[0]?.text || '[]');
    return searchParsed.find((i: any) => this.isSystemConfigItem(i)) || null;
  }

  private isSystemConfigItem(item: any): boolean {
    return (item.name || item.title || '').includes('[Hệ thống]');
  }

  private async createNewList(roomId: string): Promise<any | null> {
    const res: any = await this.app.callServerTool({
      name: 'mcpapp.lists.create',
      arguments: {
        roomId,
        name: `${PrivOSLifecycleService.SYSTEM_PREFIX} Hồ sơ nhân sự`,
        fieldDefinitions: this.getInitialFieldDefinitions(),
        stages: this.getInitialStages()
      }
    });

    const parsed: any = parseToolResult(res);
    const newList = parsed.list || parsed || null;

    if (!newList || typeof newList !== 'object' || !(newList._id || newList.id)) {
      throw new Error(`mcpapp.lists.create for room ${roomId} returned no usable list id.`);
    }

    if (newList && parsed.stages) {
      await this.createSystemConfigItem(newList._id || newList.id, parsed.stages);
      newList.stages = parsed.stages;
    }

    return newList;
  }

  private async createSystemConfigItem(listId: string, stages: any[]): Promise<void> {
    await this.app.callServerTool({
      name: 'mcpapp.lists.createItem',
      arguments: {
        listId,
        title: PrivOSLifecycleService.SYSTEM_CONFIG_NAME,
        description: JSON.stringify(stages)
      }
    });
  }

  private getInitialFieldDefinitions(): any[] {
    return [
      { name: "Số điện thoại", type: "TEXT" },
      { name: "Email", type: "TEXT" },
      { name: "Vị trí", type: "SELECT", options: [{ value: "Developer" }, { value: "Tester" }, { value: "HR" }, { value: "Sales" }] },
      { name: "Phòng ban", type: "SELECT", options: [{ value: "IT" }, { value: "Business" }, { value: "Back-office" }] },
      { name: "Ngày bắt đầu", type: "DATE" },
      { name: "Hồ sơ đính kèm", type: "DOCUMENT" }
    ];
  }

  private getInitialStages(): any[] {
    return [
      { name: "Mới nhận việc", color: "#f59e0b" },
      { name: "Đang thử việc", color: "#3b82f6" },
      { name: "Chính thức", color: "#10b981" },
      { name: "Nghỉ việc", color: "#ef4444" }
    ];
  }

  /**
   * Read EVERY item of a list.
   *
   * This used to send a bare `count: 100` and return whatever came back. `PayrollDashboard`
   * treats any employee missing from this roster as an orphan and deletes their payroll row, so
   * a silently truncated read at employee 101 destroyed real salary data.
   *
   * `mcpapp.lists.getItems` is not documented in this repo as supporting `offset`, so rather than
   * assume it does, every page is checked for progress: a page that yields no unseen id means the
   * hub ignored `offset`, and that throws. Returning a partial roster is the failure mode this
   * method exists to prevent, so it is never the fallback.
   */
  private async fetchListItems(listId: string): Promise<any[]> {
    const pageSize = PrivOSLifecycleService.ITEMS_PAGE_SIZE;
    const collected: any[] = [];
    const seenIds = new Set<string>();

    for (let page = 0; page < PrivOSLifecycleService.ITEMS_MAX_PAGES; page += 1) {
      const res: any = await this.app.callServerTool({
        name: 'mcpapp.lists.getItems',
        arguments: { listId, count: pageSize, offset: page * pageSize }
      });

      const parsed: any = parseToolResult(res);
      const items: any[] = Array.isArray(parsed) ? parsed : (parsed?.items || []);

      let fresh = 0;
      for (const item of items) {
        const id = typeof item?._id === 'string' ? item._id : (typeof item?.id === 'string' ? item.id : '');
        if (!id) {
          throw new Error(
            `Danh sách ${listId} có item không mang _id lẫn id nên không đối chiếu được với bảng lương. Dừng để không trả về roster không an toàn.`
          );
        }
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        collected.push(item);
        fresh += 1;
      }

      if (items.length > 0 && fresh === 0) {
        throw new Error(
          `Không đọc hết được danh sách ${listId}: trang ${page + 1} chỉ trả về item đã thấy, `
          + 'nghĩa là mcpapp.lists.getItems bỏ qua tham số offset. Dừng để không trả về roster thiếu.'
        );
      }

      if (items.length < pageSize) return collected;
    }

    throw new Error(
      `Danh sách ${listId} vượt quá ${PrivOSLifecycleService.ITEMS_MAX_PAGES * pageSize} item. `
      + 'Dừng để không trả về roster thiếu.'
    );
  }

  private createFieldDefinitionMap(fieldDefinitions: any[] | undefined): Map<string, any> {
    const fieldDefMap = new Map<string, any>();
    if (fieldDefinitions) {
      fieldDefinitions.forEach((fd: any) => {
        fieldDefMap.set(fd._id || fd.id, fd); // Fixed ID lookup
      });
    }
    return fieldDefMap;
  }

  private mapItemToProfile(item: any, list: any, fieldDefMap: Map<string, any>): EmployeeProfile {
    const profile: any = {
      _id: item._id || item.id,
      name: item.name || item.title || 'Không có tên',
      status: this.getStageName(item, list.stages),
    };

    if (item.description) {
        const sourceMatch = item.description.match(/\[sourceCandidateId:(.+?)\]/);
        if (sourceMatch) {
          profile.sourceCandidateId = sourceMatch[1];
        }

        const fileIdMatch = item.description.match(/\[fileId:(.+?)\]/);
        if (fileIdMatch) {
          profile.attachedFileId = fileIdMatch[1];
        }

        const fileMatch = item.description.match(/\[fileUrl:(.+?)\]/);
        if (fileMatch) {
          profile.attachedFileUrl = fileMatch[1];
        }
    }

    if (item.customFields) {
      this.extractCustomFields(profile, item.customFields, fieldDefMap);
    }

    return profile as EmployeeProfile;
  }

  private getStageName(item: any, stages: any[]): string {
    const stageId = item.stageId || item.stage_id || item.stage?._id || item.stage?.id;
    if (stageId && Array.isArray(stages) && stages.length > 0) {
      const matchedStage = stages.find((s: any) => s._id === stageId || s.id === stageId);
      if (matchedStage) {
        return matchedStage.name;
      }
    }
    
    // Helper to validate if a string is a valid Kanban status
    const isValidStatus = (statusStr: string) => {
      return Array.isArray(stages) && stages.some(s => s.name === statusStr);
    };

    let resolvedStatus = PrivOSLifecycleService.DEFAULT_STAGE;
    if (typeof item.stage === 'string' && isValidStatus(item.stage)) resolvedStatus = item.stage;
    else if (typeof item.status === 'string' && isValidStatus(item.status)) resolvedStatus = item.status;
    else if (item.stage?.name && isValidStatus(item.stage.name)) resolvedStatus = item.stage.name;
    
    console.warn(`[PrivOSLifecycleService] Item ${item._id} mapped to status: "${resolvedStatus}". Raw item info:`, { stageId, stage: item.stage, status: item.status, stages });
    
    // Also send log to backend IDE terminal
    try {
      this.app.callServerTool({
        name: 'debug_log',
        arguments: {
          message: `Item ${item._id} mapped to status: "${resolvedStatus}"`,
          data: { stageId, stage: item.stage, status: item.status, stages }
        }
      }).catch(err => console.error("Failed to send debug log", err));
    } catch(e) {}

    return resolvedStatus;
  }

  private extractCustomFields(profile: any, customFieldsData: any, fieldDefMap: Map<string, any>): void {
    const parseField = (fieldId: string, val: any) => {
      const fd = fieldDefMap.get(fieldId);
      if (!fd) return;

      const displayVal = this.getDisplayValueForField(fd, val);
      this.assignProfileFieldByName(profile, fd.name, displayVal);
    };

    if (Array.isArray(customFieldsData)) {
      customFieldsData.forEach((cf: any) => parseField(cf.fieldId || cf.fieldDefinitionId, cf.value));
    } else if (typeof customFieldsData === 'object') {
      Object.keys(customFieldsData).forEach(key => parseField(key, customFieldsData[key]));
    }
  }

  private getDisplayValueForField(fd: any, rawValue: any): any {
    if (fd.type === 'SELECT' && Array.isArray(fd.options)) {
      const opt = fd.options.find((o: any) => o._id === rawValue || o.id === rawValue);
      if (opt) return opt.value;
    }
    return rawValue;
  }

  private assignProfileFieldByName(profile: any, fieldName: string, value: any): void {
    const fname = fieldName.toLowerCase();

    if (fname.includes('thoại') || fname.includes('phone')) profile.phone = value;
    else if (fname.includes('email')) profile.email = value;
    else if (fname.includes('vị trí') || fname.includes('position')) profile.position = value;
    else if (fname.includes('phòng')) profile.department = value;
    else if (fname.includes('ngày') || fname.includes('date')) profile.startDate = value;
    else if (fname.includes('hồ sơ') || fname.includes('document')) profile.attachedFileObj = Array.isArray(value) ? value[0] : value;
  }

  private buildCustomFieldsForCreation(data: Omit<EmployeeProfile, '_id' | 'status'>, fieldDefinitions: any[] | undefined): any[] {
    const customFields: any[] = [];
    if (!fieldDefinitions) return customFields;

    fieldDefinitions.forEach((fd: any) => {
      const valueToSave = this.getProfileValueByFieldName(data, fd.name);
      if (valueToSave) {
        customFields.push({
          fieldId: fd._id || fd.id, // Fixed ID lookup
          value: this.getRawValueForField(fd, valueToSave)
        });
      }
    });

    return customFields;
  }

  private getProfileValueByFieldName(data: any, fieldName: string): any {
    const fname = fieldName.toLowerCase();
    if (fname.includes('thoại') || fname.includes('phone')) return data.phone;
    if (fname.includes('email')) return data.email;
    if (fname.includes('vị trí') || fname.includes('position')) return data.position;
    if (fname.includes('phòng')) return data.department;
    if (fname.includes('ngày') || fname.includes('date')) return data.startDate;
    return undefined;
  }

  private getRawValueForField(fd: any, displayValue: any): any {
    if (fd.type === 'SELECT' && Array.isArray(fd.options)) {
      const opt = fd.options.find((o: any) => o.value === displayValue);
      if (opt) return opt._id || opt.id;
    }
    return displayValue;
  }

  private async fetchAllLists(roomId: string): Promise<any[]> {
    const res: any = await this.app.callServerTool({
      name: 'mcpapp.lists.getAll',
      arguments: { roomId }
    });

    const text = res?.content?.[0]?.text;
    if (!text) return [];

    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : (parsed?.lists || []);
  }

  private async fetchListStages(listId: string): Promise<any[]> {
    // 1. Try MCP tool privos.stages.getByList
    try {
      const res: any = await this.app.callServerTool({
        name: 'mcpapp.stages.getByList',
        arguments: { listId }
      });
      const text = res?.content?.[0]?.text;
      if (text) {
        const parsed = JSON.parse(text);
        const stages = Array.isArray(parsed) ? parsed : (parsed?.stages || []);
        if (stages.length > 0) return stages;
      }
    } catch (err) {
      console.warn(`[PrivOSLifecycleService] Could not fetch stages via tool for list ${listId}:`, err);
    }

    // 2. Fallback via restCall lists.info if available
    try {
      if (this.app?.rest) {
        const res: any = await this.app.rest({
          method: 'GET',
          path: 'lists.info',
          query: { listId }
        });
        const body: any = res?.body ?? res;
        if (Array.isArray(body?.stages) && body.stages.length > 0) {
          return body.stages;
        }
      }
    } catch (err) {
      console.warn(`[PrivOSLifecycleService] Could not fetch stages via REST for list ${listId}:`, err);
    }

    return [];
  }

  private normalizeText(str: string): string {
    return (str || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/Đ/g, 'D')
      .trim();
  }

  private isScreeningList(list: any): boolean {
    const rawName = (list.name || '').toUpperCase();
    const normalizedName = this.normalizeText(rawName);

    // Explicitly exclude HR lifecycle lists
    const isHrLifecycle =
      normalizedName.includes('HO SO NHAN SU') ||
      normalizedName.includes('NHAN SU') ||
      normalizedName.includes('LIFECYCLE') ||
      normalizedName.includes('EMPLOYEE');

    // In a recruitment room, all other lists are candidate screening/recruitment lists
    return !isHrLifecycle;
  }

  private isPassedCandidateItem(item: any, stages?: any[]): boolean {
    const rawStageName = this.getStageName(item, stages || []);
    const stageName = this.normalizeText(rawStageName);

    // CHỈ lấy ứng viên đang ở Stage 05 (Mời phỏng vấn)
    // Dùng Regex ^05[_\s] để đảm bảo bắt buộc bắt đầu bằng 05_ hoặc 05 (tránh dính 105_)
    const isStage5 = /^05[_\s]/.test(stageName) ||
      stageName.includes('MOI PHONG VAN') ||
      stageName.includes('MOI_PHONG_VAN');

    return isStage5;
  }

  private mapItemToPassedCandidate(item: any, list: any): PassedCandidate {
    const rawTitle = item.name || item.title || 'Không có tên';
    const parsedNameInfo = this.cleanCandidateName(rawTitle);
    const scoreVal = this.extractFieldValue(item.customFields, ['tong_diem', 'điểm', 'score', 'diem']);
    const categoryVal = this.extractFieldValue(item.customFields, ['phan_loai', 'loại', 'category', 'ket_qua']);
    const reasonVal = this.extractFieldValue(item.customFields, ['ly_do', 'lý do', 'reason', 'nhan_xet']);
    const emailVal = this.extractFieldValue(item.customFields, ['email', 'thu_dien_tu']);
    const phoneVal = this.extractFieldValue(item.customFields, ['sdt', 'sđt', 'phone', 'dien_thoai', 'điện thoại']);

    return {
      _id: item._id || item.id,
      name: parsedNameInfo.name,
      listName: list.name || 'Screening List',
      listId: list._id || list.id,
      score: typeof scoreVal === 'number' ? scoreVal : (scoreVal ? Number(scoreVal) : undefined),
      category: categoryVal ? String(categoryVal) : undefined,
      stageName: this.getStageName(item, list.stages || []),
      reason: reasonVal ? String(reasonVal) : (item.description || undefined),
      position: parsedNameInfo.position,
      email: emailVal ? String(emailVal).trim() : undefined,
      phone: phoneVal ? String(phoneVal).trim() : undefined,
    };
  }

  private extractFieldValue(customFields: any, fieldKeys: string[]): any {
    if (!customFields) return undefined;

    if (Array.isArray(customFields)) {
      for (const cf of customFields) {
        const id = (cf.fieldId || cf.fieldDefinitionId || cf.name || '').toLowerCase();
        if (fieldKeys.some(key => id.includes(key.toLowerCase()))) {
          return cf.value;
        }
      }
    } else if (typeof customFields === 'object') {
      for (const key of Object.keys(customFields)) {
        if (fieldKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
          return customFields[key];
        }
      }
    }
    return undefined;
  }

  private cleanCandidateName(rawTitle: string): { name: string, position?: string } {
    let title = rawTitle.replace(/\.(md|pdf)$/i, '').trim();
    // Remove date prefix like 2026-07-06_ or 2026_07_06_
    title = title.replace(/^\d{4}[-_]\d{2}[-_]\d{2}_?/i, '');
    // Remove CV_ or CV- prefix
    title = title.replace(/^CV[-_]?/i, '');

    // Split by _ or - to extract position if present (e.g. "NguyenVanA_Developer")
    const parts = title.split(/[-_]/).filter(Boolean);
    if (parts.length >= 2) {
      const candidateName = parts[0].replace(/([A-Z])/g, ' $1').trim();
      const rawPos = parts.slice(1).join(' ').replace(/([A-Z])/g, ' $1').trim();
      return {
        name: candidateName || parts[0],
        position: this.normalizePosition(rawPos)
      };
    }

    return { name: title };
  }

  private normalizePosition(rawPosition: string): string {
    const pos = rawPosition.toLowerCase();
    if (pos.includes('dev') || pos.includes('lap trinh') || pos.includes('developer')) return 'Developer';
    if (pos.includes('test') || pos.includes('qa') || pos.includes('kiem thu')) return 'Tester';
    if (pos.includes('design') || pos.includes('ui') || pos.includes('ux')) return 'Designer';
    if (pos.includes('product') || pos.includes('pm')) return 'Product Manager';
    if (pos.includes('hr') || pos.includes('nhan su') || pos.includes('recruiter')) return 'HR';
    if (pos.includes('sale') || pos.includes('kinh doanh')) return 'Sales';
    if (pos.includes('market')) return 'Marketing';
    return rawPosition;
  }
}
