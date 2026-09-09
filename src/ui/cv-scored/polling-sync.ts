export class CVBoardPollingGuard {
  private generation = 0;
  private activePollId: number | null = null;
  private foregroundRefreshes = 0;
  private movingCVIds = new Set<string>();
  private pollPending = false;

  tryBeginPoll(): number | null {
    if (this.activePollId !== null || this.foregroundRefreshes > 0 || this.movingCVIds.size > 0) {
      return null;
    }
    const pollId = ++this.generation;
    this.activePollId = pollId;
    this.pollPending = false;
    return pollId;
  }

  requestPoll(): number | null {
    const pollId = this.tryBeginPoll();
    if (pollId === null) this.pollPending = true;
    return pollId;
  }

  finishPoll(pollId: number): boolean {
    if (this.activePollId === pollId) {
      this.activePollId = null;
    }
    return this.hasReadyPendingPoll();
  }

  canApplyPoll(pollId: number): boolean {
    return this.activePollId === pollId
      && this.generation === pollId
      && this.foregroundRefreshes === 0
      && this.movingCVIds.size === 0;
  }

  beginForegroundRefresh(): void {
    this.foregroundRefreshes++;
    this.generation++;
  }

  endForegroundRefresh(): boolean {
    this.foregroundRefreshes = Math.max(0, this.foregroundRefreshes - 1);
    return this.hasReadyPendingPoll();
  }

  beginMove(cvId: string): boolean {
    if (this.movingCVIds.has(cvId)) return false;
    this.movingCVIds.add(cvId);
    this.generation++;
    return true;
  }

  endMove(cvId: string): void {
    this.movingCVIds.delete(cvId);
  }

  private hasReadyPendingPoll(): boolean {
    return this.pollPending
      && this.activePollId === null
      && this.foregroundRefreshes === 0
      && this.movingCVIds.size === 0;
  }
}
