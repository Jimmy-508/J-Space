import type { KnowledgeData, KnowledgeLink, KnowledgeNode, NodeType } from '../types/knowledge'

const now = '2026-09-08T00:00:00.000Z'

const node = (
  id: string,
  title: string,
  type: NodeType,
  category: string,
  description: string,
  tags: string[] = [],
  url?: string,
): KnowledgeNode => ({
  id,
  title,
  type,
  category,
  description,
  tags,
  url,
  createdAt: now,
  updatedAt: now,
})

const link = (source: string, target: string, relation = '相關概念'): KnowledgeLink => ({
  id: `${source}-${target}`,
  source,
  target,
  relation,
})

export const defaultKnowledge: KnowledgeData = {
  nodes: [
    node('cluster-it', '資訊科技', 'topic', '核心群集', '演算法、AI、網路與資訊安全的知識星系。', ['cluster']),
    node('cluster-exam', '教檢', 'topic', '核心群集', '教師檢定與教育專業科目的整理入口。', ['cluster']),
    node('cluster-resources', '教學資源', 'resource', '核心群集', '教材、題目、影片與活動的素材集合。', ['cluster']),
    node('cluster-projects', '我的作品', 'project', '核心群集', '已完成作品與可展示網站入口。', ['cluster']),
    node('algo', '演算法', 'topic', '資訊科技', '用來解決問題的步驟、策略與效率分析。', ['CS', 'problem solving']),
    node('binary-search', '二分搜尋', 'topic', '資訊科技', '在有序資料中快速縮小搜尋範圍的經典方法。', ['algorithm', 'search']),
    node('dijkstra', 'Dijkstra', 'topic', '資訊科技', '處理非負權重圖中最短路徑的演算法。', ['graph', 'shortest path']),
    node('prim', 'Prim', 'topic', '資訊科技', '從節點擴張最小生成樹的演算法。', ['graph', 'MST']),
    node('kruskal', 'Kruskal', 'topic', '資訊科技', '以邊排序建立最小生成樹的演算法。', ['graph', 'MST']),
    node('ai', 'AI', 'topic', '資訊科技', '人工智慧概念、模型與教學應用。', ['machine learning']),
    node('network', '網路', 'topic', '資訊科技', '通訊協定、網路架構與服務。', ['internet']),
    node('security', '資訊安全', 'topic', '資訊科技', '安全威脅、防護觀念與系統風險。', ['security']),
    node('edu-psych', '教育心理學', 'topic', '教檢', '學習理論、動機、發展與差異化教學。', ['education']),
    node('edu-philosophy', '教育哲學', 'topic', '教檢', '教育目的、價值與思想脈絡。', ['education']),
    node('curriculum', '課程與教學', 'topic', '教檢', '課程設計、教學策略與學習活動安排。', ['teaching']),
    node('classroom', '班級經營', 'topic', '教檢', '班級規範、互動、衝突處理與正向支持。', ['management']),
    node('assessment', '測驗與評量', 'topic', '教檢', '形成性、總結性評量與試題分析。', ['assessment']),
    node('pdf', 'PDF', 'file', '教學資源', '未來可代表講義、閱讀資料或考題檔案。', ['file']),
    node('slides', '簡報', 'file', '教學資源', '課堂投影片與教學說明材料。', ['presentation']),
    node('video', '影片', 'resource', '教學資源', '教學影片、示範影片與外部影音資源。', ['media']),
    node('questions', '題目', 'resource', '教學資源', '練習題、測驗題與討論題。', ['practice']),
    node('images', '圖片', 'file', '教學資源', '圖像、截圖與視覺輔助素材。', ['visual']),
    node('activity', '教學活動', 'resource', '教學資源', '課堂活動、任務設計與互動流程。', ['activity']),
    node('chain-realm', '鍊界', 'project', '我的作品', '已完成作品入口，第一版使用暫代網址。', ['portfolio'], 'https://example.com'),
    node('jls', 'JLS', 'project', '我的作品', '已完成作品入口，第一版使用暫代網址。', ['portfolio'], 'https://example.com'),
    node('scheduler', '教務配課系統', 'project', '我的作品', '已完成作品入口，第一版使用暫代網址。', ['portfolio'], 'https://example.com'),
    node('personal-site', '個人網站', 'project', '我的作品', '已完成作品入口，第一版使用暫代網址。', ['portfolio'], 'https://example.com'),
  ],
  links: [
    link('cluster-it', 'algo', '包含'), link('cluster-it', 'ai', '包含'), link('cluster-it', 'network', '包含'), link('cluster-it', 'security', '包含'),
    link('algo', 'binary-search', '範例'), link('algo', 'dijkstra', '圖論'), link('algo', 'prim', '圖論'), link('algo', 'kruskal', '圖論'),
    link('dijkstra', 'network', '應用'), link('security', 'network', '關聯'),
    link('cluster-exam', 'edu-psych', '包含'), link('cluster-exam', 'edu-philosophy', '包含'), link('cluster-exam', 'curriculum', '包含'), link('cluster-exam', 'classroom', '包含'), link('cluster-exam', 'assessment', '包含'),
    link('cluster-resources', 'pdf', '包含'), link('cluster-resources', 'slides', '包含'), link('cluster-resources', 'video', '包含'), link('cluster-resources', 'questions', '包含'), link('cluster-resources', 'images', '包含'), link('cluster-resources', 'activity', '包含'),
    link('curriculum', 'activity', '產出'), link('assessment', 'questions', '使用'), link('edu-psych', 'activity', '支持'),
    link('cluster-projects', 'chain-realm', '作品'), link('cluster-projects', 'jls', '作品'), link('cluster-projects', 'scheduler', '作品'), link('cluster-projects', 'personal-site', '作品'),
  ],
}
