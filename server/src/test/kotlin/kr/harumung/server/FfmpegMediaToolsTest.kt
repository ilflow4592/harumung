package kr.harumung.server

import kr.harumung.server.media.FfmpegMediaTools
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import kotlin.test.assertTrue

/** ffmpeg가 설치된 환경에서만 실행된다. 없으면 건너뛴다. */
class FfmpegMediaToolsTest {

    private val tools = FfmpegMediaTools("ffmpeg", Files.createTempDirectory("harumung-test").toString())

    @Test
    fun `합성 영상을 720p mp4로 변환한다`() {
        assumeTrue(tools.isAvailable(), "ffmpeg 없음")
        val src = Files.createTempFile("src", ".mp4")
        val gen = ProcessBuilder(
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30:duration=1",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", src.toString(),
        ).redirectErrorStream(true).start()
        gen.waitFor()
        assumeTrue(gen.exitValue() == 0, "테스트 영상 생성 실패")

        val result = tools.transcode720p(src)
        assertTrue(Files.size(result.output) > 0)
        assertTrue(result.durationMs in 900..1100, "duration=${result.durationMs}")
        assertTrue(Files.size(tools.captureFrame(result.output, 100)) > 0)
    }
}
