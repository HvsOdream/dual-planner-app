# DUAL Planner — cap add ios 로 만든 Xcode 프로젝트에 앱 전용 Swift 파일과 위젯·공유 확장 타깃을 넣는다.
# 실행: (app/ 에서) ruby scripts/add-native.rb   ※ pod install 다음에
require 'xcodeproj'
require 'fileutils'

ROOT = File.expand_path('..', __dir__)
IOS = File.join(ROOT, 'ios', 'App')
SRC = File.join(ROOT, 'native', 'ios')
APP_ID = 'com.hvsodream.dualplanner'
DEPLOY = '17.0'

proj = Xcodeproj::Project.open(File.join(IOS, 'App.xcodeproj'))
app = proj.targets.find { |t| t.name == 'App' } or abort 'App 타깃 없음'
app_group = proj.main_group['App'] or abort 'App 그룹 없음'

def copy_into(src_dir, dst_dir)
  FileUtils.mkdir_p(dst_dir)
  Dir[File.join(src_dir, '*')].each { |f| FileUtils.cp(f, dst_dir) }
end

# 1) 앱 타깃: Swift 파일 + 엔타이틀먼트
copy_into(File.join(SRC, 'App'), File.join(IOS, 'App'))
shared_ref = nil
Dir[File.join(SRC, 'App', '*.swift')].sort.each do |f|
  name = File.basename(f)
  ref = app_group.files.find { |r| r.path == name } || app_group.new_reference(name)
  shared_ref = ref if name == 'SharedStore.swift'
  app.source_build_phase.add_file_reference(ref, true)
end
app_group.new_reference('App.entitlements') unless app_group.files.any? { |r| r.path == 'App.entitlements' }
app.build_configurations.each do |c|
  c.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY
end

# 2) 확장 타깃 만들기
def add_extension(proj, app, name, bundle, files, shared_ref)
  return proj.targets.find { |t| t.name == name } if proj.targets.any? { |t| t.name == name }
  t = proj.new_target(:app_extension, name, :ios, DEPLOY, nil, :swift)
  grp = proj.main_group.new_group(name, name)
  files.each { |f| t.source_build_phase.add_file_reference(grp.new_reference(f), true) }
  t.source_build_phase.add_file_reference(shared_ref, true)
  grp.new_reference('Info.plist'); grp.new_reference("#{name}.entitlements")
  t.build_configurations.each do |c|
    s = c.build_settings
    s['PRODUCT_BUNDLE_IDENTIFIER'] = bundle
    s['PRODUCT_NAME'] = '$(TARGET_NAME)'
    s['INFOPLIST_FILE'] = "#{name}/Info.plist"
    s['GENERATE_INFOPLIST_FILE'] = 'NO'
    s['CODE_SIGN_ENTITLEMENTS'] = "#{name}/#{name}.entitlements"
    s['SWIFT_VERSION'] = '5.0'
    s['TARGETED_DEVICE_FAMILY'] = '1,2'
    s['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY
    s['SKIP_INSTALL'] = 'YES'
    s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
    s['MARKETING_VERSION'] = app.build_configurations.first.build_settings['MARKETING_VERSION'] || '1.0'
    s['CURRENT_PROJECT_VERSION'] = app.build_configurations.first.build_settings['CURRENT_PROJECT_VERSION'] || '1'
    s['VERSIONING_SYSTEM'] = 'apple-generic'
    s['DEVELOPMENT_TEAM'] = app.build_configurations.first.build_settings['DEVELOPMENT_TEAM'] if app.build_configurations.first.build_settings['DEVELOPMENT_TEAM']
  end
  # 앱 안에 끼워 넣기(PlugIns)
  embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } || app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.dst_subfolder_spec = '13'
  bf = embed.add_file_reference(t.product_reference, true)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  app.add_dependency(t)
  t
end

copy_into(File.join(SRC, 'DualWidget'), File.join(IOS, 'DualWidget'))
copy_into(File.join(SRC, 'DualShare'), File.join(IOS, 'DualShare'))
add_extension(proj, app, 'DualWidget', "#{APP_ID}.widget", ['DualWidget.swift'], shared_ref)
add_extension(proj, app, 'DualShare', "#{APP_ID}.share", ['ShareViewController.swift'], shared_ref)

# 앱 버전과 확장 버전 맞추기(App Store 규칙)
proj.build_configuration_list.build_configurations.each { |c| c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOY }
proj.save
puts "[add-native] targets: #{proj.targets.map(&:name).join(', ')}"
