/**
 * 本番公開テストドロワー用（新規・編集共通）
 */
export type PublishTestFocusProject = {
  projectId: string;
  slug: string | null;
  publishStatus: string | null;
  /** projects.wp_url（Next 公開時の canonical URL を保存） */
  publicUrl: string | null;
  /** DB 読込時点の service */
  savedService: string | null;
  /** フォーム上のターゲットサービス（親が都度渡す・未保存の変更を含む） */
  formService?: string | null;
};
