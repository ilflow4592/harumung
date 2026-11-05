import AVFoundation
import ExpoModulesCore
import UIKit

/// 영상 변환·트림·무음·프레임 캡처. 모두 새 파일을 만들고 원본은 건드리지 않는다.
public class MediaToolsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MediaTools")

    Events("onProgress")

    AsyncFunction("transcode720p") { (inputPath: String) -> [String: Any] in
      let asset = AVURLAsset(url: Self.fileURL(inputPath))
      let output = Self.newOutputURL(ext: "mp4")
      try await Self.export(asset: asset, to: output, preset: AVAssetExportPreset1280x720, timeRange: nil, mute: false)
      let duration = try await asset.load(.duration)
      let size = (try? FileManager.default.attributesOfItem(atPath: output.path)[.size] as? NSNumber)?.int64Value ?? 0
      return [
        "outputPath": output.path,
        "durationMs": Int(CMTimeGetSeconds(duration) * 1000),
        "sizeBytes": size,
      ]
    }

    AsyncFunction("trim") { (inputPath: String, startMs: Double, endMs: Double) -> [String: Any] in
      let asset = AVURLAsset(url: Self.fileURL(inputPath))
      let output = Self.newOutputURL(ext: "mp4")
      let start = CMTime(seconds: startMs / 1000, preferredTimescale: 600)
      let end = CMTime(seconds: endMs / 1000, preferredTimescale: 600)
      try await Self.export(asset: asset, to: output, preset: AVAssetExportPresetPassthrough, timeRange: CMTimeRange(start: start, end: end), mute: false)
      return ["outputPath": output.path]
    }

    AsyncFunction("mute") { (inputPath: String) -> [String: Any] in
      let asset = AVURLAsset(url: Self.fileURL(inputPath))
      let output = Self.newOutputURL(ext: "mp4")
      try await Self.export(asset: asset, to: output, preset: AVAssetExportPresetPassthrough, timeRange: nil, mute: true)
      return ["outputPath": output.path]
    }

    AsyncFunction("captureFrame") { (inputPath: String, atMs: Double) -> [String: Any] in
      let asset = AVURLAsset(url: Self.fileURL(inputPath))
      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.requestedTimeToleranceBefore = .zero
      generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)
      let time = CMTime(seconds: atMs / 1000, preferredTimescale: 600)
      let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
      guard let data = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.9) else {
        throw MediaToolsError.encodeFailed
      }
      let output = Self.newOutputURL(ext: "jpg")
      try data.write(to: output)
      return ["imagePath": output.path]
    }
  }

  // MARK: - helpers

  private static func fileURL(_ path: String) -> URL {
    if path.hasPrefix("file://") { return URL(string: path)! }
    return URL(fileURLWithPath: path)
  }

  private static func newOutputURL(ext: String) -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("media-tools", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
  }

  /// mute=true면 비디오 트랙만 담은 컴포지션을 내보낸다.
  private static func export(asset: AVAsset, to output: URL, preset: String, timeRange: CMTimeRange?, mute: Bool) async throws {
    let source: AVAsset
    if mute {
      let composition = AVMutableComposition()
      guard let videoTrack = try await asset.loadTracks(withMediaType: .video).first,
            let compTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
        throw MediaToolsError.noVideoTrack
      }
      let duration = try await asset.load(.duration)
      try compTrack.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: videoTrack, at: .zero)
      compTrack.preferredTransform = try await videoTrack.load(.preferredTransform)
      source = composition
    } else {
      source = asset
    }
    guard let session = AVAssetExportSession(asset: source, presetName: preset) else {
      throw MediaToolsError.exportUnavailable
    }
    session.outputURL = output
    session.outputFileType = .mp4
    session.shouldOptimizeForNetworkUse = true
    if let range = timeRange { session.timeRange = range }
    await session.export()
    if session.status != .completed {
      throw MediaToolsError.exportFailed(session.error?.localizedDescription ?? "unknown")
    }
  }
}

enum MediaToolsError: Error, LocalizedError {
  case noVideoTrack
  case exportUnavailable
  case exportFailed(String)
  case encodeFailed

  var errorDescription: String? {
    switch self {
    case .noVideoTrack: return "영상 트랙이 없습니다."
    case .exportUnavailable: return "이 기기에서 내보내기를 지원하지 않습니다."
    case .exportFailed(let reason): return "내보내기 실패: \(reason)"
    case .encodeFailed: return "이미지 인코딩에 실패했습니다."
    }
  }
}
