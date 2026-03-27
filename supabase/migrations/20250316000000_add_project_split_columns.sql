-- エリア×サービス単位のプロジェクト分割用カラム追加
-- improvement_log: 改善ログ（impressions, clicks, conversions, ctr, cv_rate, last_updated）

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS parent_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS area text,
ADD COLUMN IF NOT EXISTS service text,
ADD COLUMN IF NOT EXISTS keyword text,
ADD COLUMN IF NOT EXISTS improvement_log jsonb DEFAULT '{}';

-- インデックス（親子・エリア・サービス検索用）
CREATE INDEX IF NOT EXISTS idx_projects_parent_project_id ON projects(parent_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_area ON projects(area);
CREATE INDEX IF NOT EXISTS idx_projects_service ON projects(service);
CREATE INDEX IF NOT EXISTS idx_projects_keyword ON projects(keyword);
