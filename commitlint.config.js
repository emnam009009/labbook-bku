/**
 * Commitlint config — enforce Conventional Commits
 * https://www.conventionalcommits.org/
 *
 * Format: <type>(<scope>): <description>
 * Examples:
 *   feat(booking): add recurring booking
 *   fix(presence): cancel onDisconnect on logout
 *   docs(readme): update setup guide
 */

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Type bắt buộc, phải nằm trong list dưới
    'type-enum': [
      2, 'always',
      [
        'feat',     // Tính năng mới
        'fix',      // Sửa bug
        'docs',     // Sửa tài liệu
        'style',    // Format code (không đổi logic)
        'refactor', // Refactor code
        'perf',     // Tối ưu performance
        'test',     // Thêm/sửa test
        'chore',    // Build, deps, config
        'ci',       // CI config
        'revert',   // Revert commit
      ],
    ],
    // Subject không được kết thúc bằng dấu chấm
    'subject-full-stop': [2, 'never', '.'],
    // Subject phải lowercase first char
    'subject-case': [
      2, 'never',
      ['sentence-case', 'start-case', 'pascal-case', 'upper-case'],
    ],
    // Subject không được rỗng
    'subject-empty': [2, 'never'],
    // Body line max 100 chars (tăng từ default 72 cho tiếng Việt dài hơn)
    'body-max-line-length': [1, 'always', 100],
    // Header (line đầu tiên) max 100 chars
    'header-max-length': [2, 'always', 100],
  },
}
