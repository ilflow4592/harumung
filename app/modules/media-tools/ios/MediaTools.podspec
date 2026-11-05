Pod::Spec.new do |s|
  s.name           = 'MediaTools'
  s.version        = '0.1.0'
  s.summary        = '하루멍 영상 변환·트림·무음·프레임 캡처'
  s.description    = 'AVFoundation 기반 미디어 처리 Expo 모듈'
  s.author         = ''
  s.homepage       = 'https://harumung.kr'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
