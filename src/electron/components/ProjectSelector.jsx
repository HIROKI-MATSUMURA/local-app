import React, { useState, useEffect } from 'react';
import { Button, Typography, Card, List, ListItem, Divider, Box } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const ProjectSelector = ({ onProjectSelect }) => {
  const [recentProjects, setRecentProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);

  useEffect(() => {
    // アプリ起動時に最近使用したプロジェクト一覧を取得
    const loadRecentProjects = async () => {
      try {
        const result = await window.api.send('get-recent-projects');
        if (result && result.projects) {
          setRecentProjects(result.projects);
        }

        // 現在のプロジェクト設定を取得
        const currentResult = await window.api.send('get-current-project');
        if (currentResult && currentResult.project) {
          setCurrentProject(currentResult.project);
          // 親コンポーネントに通知
          if (onProjectSelect) {
            onProjectSelect(currentResult.project);
          }
        }
      } catch (error) {
        console.error('プロジェクト情報の取得に失敗しました:', error);
      }
    };

    loadRecentProjects();

    // イベントリスナーの設定
    const handleProjectUpdated = (project) => {
      setCurrentProject(project);
      // 最近使用したプロジェクト一覧を更新
      setRecentProjects(prev => {
        const filtered = prev.filter(p => p.path !== project.path);
        return [project, ...filtered].slice(0, 5); // 最大5件まで保持
      });
    };

    window.api.receive('project-updated', handleProjectUpdated);

    return () => {
      // コンポーネントのアンマウント時にリスナーを削除
      window.api.removeListener('project-updated', handleProjectUpdated);
    };
  }, [onProjectSelect]);

  const handleSelectFolder = async () => {
    try {
      const result = await window.api.send('select-project-folder');
      if (result && result.success && result.project) {
        setCurrentProject(result.project);

        // 親コンポーネントに通知
        if (onProjectSelect) {
          onProjectSelect(result.project);
        }
      }
    } catch (error) {
      console.error('プロジェクトフォルダの選択に失敗しました:', error);
    }
  };

  const handleSelectRecentProject = async (project) => {
    try {
      const result = await window.api.send('set-current-project', { projectPath: project.path });
      if (result && result.success) {
        setCurrentProject(project);

        // 親コンポーネントに通知
        if (onProjectSelect) {
          onProjectSelect(project);
        }
      }
    } catch (error) {
      console.error('プロジェクトの設定に失敗しました:', error);
    }
  };

  const handleRemoveProject = async (project, event) => {
    event.stopPropagation(); // リストアイテムのクリックイベントが発火しないようにする

    try {
      const result = await window.api.send('remove-recent-project', { projectPath: project.path });
      if (result && result.success) {
        // 削除したプロジェクトが現在のプロジェクトだった場合、現在のプロジェクトをクリア
        if (currentProject && currentProject.path === project.path) {
          setCurrentProject(null);
        }

        // 最近使用したプロジェクト一覧を更新
        setRecentProjects(prev => prev.filter(p => p.path !== project.path));
      }
    } catch (error) {
      console.error('プロジェクトの削除に失敗しました:', error);
    }
  };

  return (
    <Card sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        プロジェクト管理
      </Typography>

      {currentProject ? (
        <Box sx={{ mb: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
          <Typography variant="subtitle1">現在のプロジェクト:</Typography>
          <Typography variant="body1" sx={{ wordBreak: 'break-all' }}>
            {currentProject.name} ({currentProject.path})
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          プロジェクトが選択されていません
        </Typography>
      )}

      <Button
        variant="contained"
        startIcon={<FolderOpenIcon />}
        onClick={handleSelectFolder}
        fullWidth
        sx={{ mb: 2 }}
      >
        プロジェクトフォルダを選択
      </Button>

      {recentProjects.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            最近使用したプロジェクト
          </Typography>
          <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
            {recentProjects.map((project, index) => (
              <ListItem
                key={index}
                button
                onClick={() => handleSelectRecentProject(project)}
                secondaryAction={
                  <DeleteIcon
                    color="error"
                    fontSize="small"
                    sx={{ cursor: 'pointer' }}
                    onClick={(e) => handleRemoveProject(project, e)}
                  />
                }
                sx={{
                  borderRadius: 1,
                  mb: 0.5,
                  bgcolor: currentProject && currentProject.path === project.path ? 'action.selected' : 'transparent'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <FolderOpenIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <Typography variant="body2" noWrap>{project.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{project.path}</Typography>
                  </Box>
                  {currentProject && currentProject.path === project.path && (
                    <ArrowForwardIcon color="primary" fontSize="small" />
                  )}
                </Box>
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Card>
  );
};

export default ProjectSelector;
