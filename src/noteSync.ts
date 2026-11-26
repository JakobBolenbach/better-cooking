// Which answer about a note may still set the view's state. Reading and writing are asynchronous: an old read must not
// overwrite a newer one, and a read that started before (or while) a write ran must not show the text from before it.
// One instance per note. Pure, tested in tests/noteSync.test.ts.

export class NoteSync {
  private reads = 0;
  private edits = 0;
  private pending = 0;
  private completed = 0;

  /** A read starts; the returned check says whether its result may still be shown when it arrives. */
  startRead(): () => boolean {
    const read = ++this.reads;
    const clean = this.pending === 0;
    const completed = this.completed;
    return () => read === this.reads && clean && completed === this.completed && this.pending === 0;
  }

  /** A write starts; call the returned function once when it is done (also when it failed): true if it is still the latest write. */
  startEdit(): () => boolean {
    const edit = ++this.edits;
    this.pending++;
    return () => {
      this.pending--;
      this.completed++;
      return edit === this.edits;
    };
  }
}
