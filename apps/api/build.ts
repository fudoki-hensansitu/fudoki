const deploy = process.argv.includes('--deploy')
if (deploy) {
  const status = Bun.spawnSync(['git', 'status', '--porcelain'], {
    cwd: import.meta.dirname,
  })
  if (status.exitCode !== 0 || status.stdout.toString().trim())
    throw new Error('Commit the verified changes before deploying API code')
}
// cf は web・samples と同じ版を package に持つ（mise の cf は @cloudflare/vite-plugin の build 出力の版に追いつかないことがある）。
// Bun.spawn は node_modules/.bin を PATH に足さないので、bun run を通さずに叩いても同じ cf を使うよう path を明示する
const workerBuild = Bun.spawn(
  [`${import.meta.dirname}/node_modules/.bin/cf`, 'deploy', ...(!deploy ? ['--dry-run'] : [])],
  { cwd: import.meta.dirname, stdout: 'inherit', stderr: 'inherit' }
)
if ((await workerBuild.exited) !== 0)
  throw new Error('Worker build or deployment failed')
